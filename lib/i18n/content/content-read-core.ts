import { isSupportedLocale, type Locale } from "@/lib/i18n/config";
import {
  CONTENT_ENTITIES,
  CONTENT_ENTITY_BY_KEY,
  CONTENT_LOCALES,
  contentFallbackChain,
  type ContentEntityDef,
  type ContentEntityKey,
} from "@/lib/i18n/content/content-registry";
import type {
  ContentCoverage,
  ContentReadOptions,
  ContentReadService,
  ContentValues,
  LocalizedContent,
} from "@/lib/i18n/content/content-contract";
import {
  applyBaseSupplements,
  contentCacheKey,
  indexContentRows,
  normalizeParentIds,
  resolveLocalizedContent,
} from "@/lib/i18n/content/content-resolve";
import type { ContentRepository } from "@/lib/i18n/content/content-repository";
import {
  sanitizeContentLocaleContext,
  type ContentLocaleContext,
} from "@/lib/i18n/content/content-locale-context";
import { contentCacheTags, isPersistentlyCacheable } from "@/lib/i18n/content/content-cache-policy";

/* ===============================================================
   🌐 MERKEZİ SİMETRİK İÇERİK OKUMA SERVİSİ — ÇEKİRDEK (Faz 3)
   ===============================================================
   Next/React/pg bağımlılığı YOK; bağımlılıklar enjekte edilir:
     • repository        → SQL (content-repository.ts)
     • getLocaleContext  → ana dil + aktif diller (settings)
     • cache (opsiyonel) → kalıcı cache adaptörü (unstable_cache)
   Sunucu bağlantısı content-read.server.ts içindedir.

   DAVRANIŞ
     • Okuma sırası: istenen → ana dil → diğer aktif diller (tekrarsız,
       pasif dil yok, TR özel durumu yok).
     • Bir çağrı = varlık başına TEK sorgu (bütün diller tek seferde;
       aynı dil iki kez sorgulanmaz). getContent = getContentMany([id]).
       Faz 3.1: ana tablo ek yedeği olan varlıkta (yalnız page:
       pages.content) buna paralel +1 sorgu; kolon varlığı süreç başına
       bir kez kontrol edilir.
     • Kimlikler korunur: dönüş Map'i ÇAĞIRANIN verdiği kimlikle
       anahtarlanır; geçersiz kimlik sessizce atlanır (DB'ye gitmez).
     • Hata: DB hatası cache'e YAZILMAZ (adaptör throw'u cache'lemez);
       public API null / boş Map döner ve onError'a bildirir — bir
       içerik okuma sorunu sayfayı çökertmez.
     • Eşzamanlılık: aynı anahtar için uçuştaki istek paylaşılır
       (thundering herd yok); anahtar dil bağlamını içerdiği için
       farklı ana dil/aktif dil kümeleri asla aynı sonucu paylaşmaz.
   =============================================================== */

export type ContentCacheAdapter = <T>(
  key: string,
  tags: string[],
  fn: () => Promise<T>
) => Promise<T>;

export type ContentReadDeps = {
  repository: ContentRepository;
  getLocaleContext: () => Promise<ContentLocaleContext> | ContentLocaleContext;
  cache?: ContentCacheAdapter;
  onError?: (err: unknown, where: string) => void;
};

export type ExtendedContentReadService = ContentReadService & {
  /** Dil bazlı slug → içerik kimliği (yalnız aktif dilde; yedek yok). */
  findIdBySlug(entity: ContentEntityKey, slug: string, locale: Locale): Promise<string | null>;
  /** Faz 6 Dalga 1 — teknik anahtar → kimlik (dilden bağımsız; tek kayıt). */
  findIdByTechnicalKey(entity: ContentEntityKey, technicalKey: string): Promise<string | null>;
  /** 14 varlık × verilen diller doluluk raporu (ana dil değişimi preflight'ı). */
  getCoverageReport(
    locales?: readonly Locale[]
  ): Promise<Record<ContentEntityKey, Partial<Record<Locale, ContentCoverage>>>>;
  /** Çözümlenen dil bağlamı + zincir (teşhis/test). */
  resolveChain(locale: Locale, opts?: ContentReadOptions): Promise<{ ctx: ContentLocaleContext; chain: Locale[] }>;
};

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function entityDef(entity: ContentEntityKey): ContentEntityDef {
  const def = CONTENT_ENTITY_BY_KEY[entity];
  if (!def) throw new Error(`content-read: bilinmeyen varlık ${String(entity)}`);
  return def;
}

export function buildChain(
  requested: Locale,
  ctx: ContentLocaleContext,
  opts?: ContentReadOptions
): Locale[] {
  if (opts?.fallback && opts.fallback.length > 0) {
    const out: Locale[] = [];
    for (const l of opts.fallback) {
      if (isSupportedLocale(l) && ctx.enabled.includes(l) && !out.includes(l)) out.push(l);
    }
    return out;
  }
  return contentFallbackChain(requested, ctx.root, ctx.enabled);
}

export function createContentReadService(deps: ContentReadDeps): ExtendedContentReadService {
  const inflight = new Map<string, Promise<unknown>>();
  const report = (err: unknown, where: string) => {
    try {
      deps.onError?.(err, where);
    } catch {
      /* noop */
    }
  };

  function shared<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = inflight.get(key) as Promise<T> | undefined;
    if (existing) return existing;
    const p = fn().finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  }

  async function localeContext(): Promise<ContentLocaleContext> {
    return sanitizeContentLocaleContext(await deps.getLocaleContext());
  }

  async function resolveChain(locale: Locale, opts?: ContentReadOptions) {
    const ctx = await localeContext();
    return { ctx, chain: buildChain(locale, ctx, opts) };
  }

  /** Kanonik kimlik → çözülmüş içerik (JSON-serileştirilebilir; Map değil
   *  çünkü unstable_cache JSON saklar). Throw edebilir (cache'lenmez). */
  async function loadResolved(
    def: ContentEntityDef,
    canonical: string[],
    requested: Locale,
    chain: Locale[],
    ctx: ContentLocaleContext
  ): Promise<Record<string, LocalizedContent>> {
    const run = async () => {
      const [rows, supplements] = await Promise.all([
        deps.repository.fetchRows(def, canonical, CONTENT_LOCALES),
        deps.repository.fetchBaseSupplements
          ? deps.repository.fetchBaseSupplements(def, canonical)
          : Promise.resolve(new Map<string, ContentValues>()),
      ]);
      const index = indexContentRows(applyBaseSupplements(def, rows, supplements));
      const out: Record<string, LocalizedContent> = {};
      for (const id of canonical) {
        const resolved = resolveLocalizedContent(def, index.get(id), requested, chain);
        if (resolved) out[id] = resolved;
      }
      return out;
    };
    const key = contentCacheKey({
      op: "many",
      entity: def.key,
      requested,
      chain,
      root: ctx.root,
      enabled: ctx.enabled,
      ids: canonical,
    });
    const viaCache =
      deps.cache && isPersistentlyCacheable(def.key)
        ? () => deps.cache!(key, contentCacheTags(def.key), run)
        : run;
    return shared(key, viaCache);
  }

  const service: ExtendedContentReadService = {
    resolveChain,

    async getContentMany(entity, parentIds, locale, opts) {
      const result = new Map<string, LocalizedContent>();
      try {
        const def = entityDef(entity);
        const requested: Locale = isSupportedLocale(locale) ? locale : (await localeContext()).root;
        const { canonical, originals } = normalizeParentIds(parentIds, def.parentIdType);
        if (canonical.length === 0) return result;
        const { ctx, chain } = await resolveChain(requested, opts);
        if (chain.length === 0) return result;
        const resolved = await loadResolved(def, canonical, requested, chain, ctx);
        for (const [cid, content] of Object.entries(resolved)) {
          for (const original of originals.get(cid) ?? [cid]) result.set(original, content);
        }
      } catch (err) {
        report(err, `getContentMany:${entity}`);
        return new Map();
      }
      return result;
    },

    async getContent(entity, parentId, locale, opts) {
      const many = await service.getContentMany(entity, [parentId], locale, opts);
      return many.get(String(parentId)) ?? null;
    },

    async getAllLocales(entity, parentId) {
      const out: Partial<Record<Locale, ContentValues & { slug?: string | null }>> = {};
      try {
        const def = entityDef(entity);
        const { canonical } = normalizeParentIds([parentId], def.parentIdType);
        if (canonical.length === 0) return out;
        const rows = await deps.repository.fetchRows(def, canonical, CONTENT_LOCALES);
        for (const row of rows) {
          out[row.locale] = def.slugKind ? { ...row.values, slug: row.slug ?? null } : { ...row.values };
        }
      } catch (err) {
        report(err, `getAllLocales:${entity}`);
        return {};
      }
      return out;
    },

    /* Admin/preflight içindir: yedek UYGULANMAZ, cache YOK (taze sayım).
       Hata durumunda throw eder — eksik sayım "%100 dolu" sanılmasın. */
    async getCoverage(entity, locale) {
      const def = entityDef(entity);
      if (!isSupportedLocale(locale)) throw new Error(`content-read: geçersiz dil ${String(locale)}`);
      return deps.repository.coverage(def, locale);
    },

    async getCoverageReport(locales = CONTENT_LOCALES) {
      const ls = [...new Set(locales)].filter(isSupportedLocale);
      const entries = await Promise.all(
        CONTENT_ENTITIES.map(async (def) => {
          const per: Partial<Record<Locale, ContentCoverage>> = {};
          for (const l of ls) per[l] = await deps.repository.coverage(def, l);
          return [def.key, per] as const;
        })
      );
      return Object.fromEntries(entries) as Record<
        ContentEntityKey,
        Partial<Record<Locale, ContentCoverage>>
      >;
    },

    async findIdByTechnicalKey(entity, technicalKey) {
      try {
        const def = entityDef(entity);
        if (!def.slugKind || !deps.repository.findParentIdsByTechnicalKey) return null;
        if (typeof technicalKey !== "string" || technicalKey.length === 0 || technicalKey.length > 200) return null;
        const ids = await deps.repository.findParentIdsByTechnicalKey(def, technicalKey);
        /* ana tablo slug UNIQUE → en fazla 1; savunmacı. */
        return ids.length === 1 ? ids[0] : null;
      } catch (err) {
        report(err, `findIdByTechnicalKey:${entity}`);
        return null;
      }
    },

    async findIdBySlug(entity, slug, locale) {
      try {
        const def = entityDef(entity);
        if (!def.slugKind) return null;
        if (typeof slug !== "string" || slug.length > 160 || !SLUG_RE.test(slug)) return null;
        const ctx = await localeContext();
        if (!isSupportedLocale(locale) || !ctx.enabled.includes(locale)) return null;
        const ids = await deps.repository.findParentIdsBySlug(def, slug, locale);
        /* 102 partial unique (locale, slug) → en fazla 1; savunmacı. */
        return ids.length === 1 ? ids[0] : null;
      } catch (err) {
        report(err, `findIdBySlug:${entity}`);
        return null;
      }
    },
  };
  return service;
}
