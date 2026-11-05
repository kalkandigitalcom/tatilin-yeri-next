import { isSupportedLocale, type Locale } from "@/lib/i18n/config";
import {
  CONTENT_ENTITIES,
  CONTENT_ENTITY_BY_KEY,
  CONTENT_LOCALES,
  type ContentEntityDef,
  type ContentEntityKey,
} from "@/lib/i18n/content/content-registry";
import type {
  ContentWriteErrorCode,
  ContentWriteItem,
  ContentWriteResult,
} from "@/lib/i18n/content/content-contract";
import { canonicalParentId } from "@/lib/i18n/content/content-resolve";
import {
  contentWriteTarget,
  validateContentPayload,
  type ContentMirrorModeValue,
  type ValidatedContentPayload,
} from "@/lib/i18n/content/content-write-validate";
import {
  sqlLockParent,
  sqlMirrorMode,
  sqlNotNullColumns,
  sqlSlugAdvisoryLock,
  sqlSlugTakenInBase,
  sqlSlugTakenInTranslation,
  sqlTranslationRow,
  sqlTxSettings,
  sqlInsertParent,
  sqlSlugSeparationCapability,
  sqlUpdateBase,
  sqlUpdateMirrorSlug,
  sqlUpdateTechnical,
  sqlUpsertTranslation,
} from "@/lib/i18n/content/content-write-sql";
import { BASE_MIRROR_LOCALE } from "@/lib/i18n/content/content-field-rules";

/* ===============================================================
   🌐 MERKEZİ SİMETRİK İÇERİK YAZMA SERVİSİ — ÇEKİRDEK (Faz 4)
   ===============================================================
   Next/React/pg bağımlılığı YOK; transaction çalıştırıcısı enjekte
   edilir (sunucu: content-write.server.ts, test: izole PG).

   HEDEF SEÇİMİ (DB'deki content_mirror_mode(), transaction içinde okunur)
     mod=base         : TR → ana tablo kalıcı ayna kolonları (+ teknik
                        slug); 106 aynası tr satırını AYNI transaction'da
                        günceller. EN/DE → çeviri satırı.
     mod=translations : TR/EN/DE → çeviri satırı; 106 aynası tr satırını
                        ana tabloya yazar (slug hariç).
     Ana dil (settings.public_default_locale) hedefi ETKİLEMEZ: ana dil
     değişince içerik taşınmaz. Servis ayna bayrağını ASLA açmaz.

   TRANSACTION / KİLİT SIRASI (deadlock'suz)
     1) SET LOCAL lock_timeout / statement_timeout
     2) mod okunur
     3) ana kayıtlar FOR UPDATE — (registry sırası, kanonik kimlik)
        sırasıyla, tekrarsız
     4) slug advisory kilitleri — anahtar sırasıyla, tekrarsız
     5) yazmalar aynı deterministik sırada; her biri tek UPDATE veya tek
        INSERT … ON CONFLICT
     Bütün öğeler TEK transaction: biri hata verirse HİÇBİRİ kalmaz.
     40P01 (deadlock) yalnız eski yazma yollarıyla çakışmada mümkündür →
     bütün transaction en fazla `maxRetries` kez yeniden denenir.
   =============================================================== */

export type TxQuery = (
  text: string,
  values?: readonly unknown[]
) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }>;

export type TransactionRunner = <T>(fn: (q: TxQuery) => Promise<T>) => Promise<T>;

export type ContentWriteDeps = {
  transaction: TransactionRunner;
  /** Faz 5 öncesi varsayılan KAPALI: eski ve yeni yazma yolu aynı anda
   *  etkin olmasın. */
  enabled: (entity: ContentEntityKey) => boolean;
  onCommitted?: (info: { entities: ContentEntityKey[]; slugChanged: boolean }) => void | Promise<void>;
  onError?: (err: unknown, where: string) => void;
  lockTimeoutMs?: number;
  statementTimeoutMs?: number;
  maxRetries?: number;
};

export type ContentWriteCtx = { actorId: string };

/** Faz 5 dalga 2 — içerikle aynı transaction'da yazılan teknik kolonlar. */
export type ContentTechnicalPatch = {
  entity: ContentEntityKey;
  parentId: string;
  values: Record<string, unknown>;
  jsonColumns?: readonly string[];
};

type PreparedTechnical = {
  def: ContentEntityDef;
  id: string;
  values: Record<string, unknown>;
  jsonColumns: readonly string[];
  order: number;
};

export type ContentWriteConfig = {
  enabled: boolean;
  mode: ContentMirrorModeValue | null;
  locales: readonly Locale[];
  entities: {
    key: ContentEntityKey;
    table: string;
    parentTable: string;
    fields: string[];
    slug: boolean;
    writeEnabled: boolean;
    targets: Record<Locale, "base" | "translation"> | null;
  }[];
};

type Prepared = {
  index: number;
  def: ContentEntityDef;
  id: string;
  locale: Locale;
  payload: ValidatedContentPayload;
  order: number;
};

class WriteFailure extends Error {
  constructor(
    public code: ContentWriteErrorCode,
    message: string,
    public field?: string,
    public index?: number
  ) {
    super(message);
  }
}

const ENTITY_ORDER = new Map(CONTENT_ENTITIES.map((e, i) => [e.key, i]));
const MODES: readonly ContentMirrorModeValue[] = ["base", "translations"];

type PgError = { code?: string; constraint?: string; message?: string };

export function mapPgError(err: unknown, index?: number): WriteFailure {
  if (err instanceof WriteFailure) return err;
  const e = (err ?? {}) as PgError;
  const msg = String(e.message ?? err);
  if (msg.includes("content_mirror_guard")) return new WriteFailure("guard", msg, undefined, index);
  switch (e.code) {
    case "23505":
      return new WriteFailure(
        "conflict",
        "Benzersizlik çakışması (aynı dilde aynı slug veya kayıt)",
        e.constraint?.includes("slug") ? "slug" : undefined,
        index
      );
    case "23514":
    case "23502":
    case "22P02":
    case "22001":
      return new WriteFailure("validation", `Veritabanı doğrulaması reddetti: ${e.constraint ?? msg}`, undefined, index);
    case "23503":
      return new WriteFailure("not-found", "Ana kayıt bulunamadı", undefined, index);
    case "55P03":
    case "57014":
      return new WriteFailure("busy", "Kayıt şu an başka bir işlem tarafından kilitli; tekrar deneyin", undefined, index);
    default:
      return new WriteFailure("db", "İçerik kaydedilemedi", undefined, index);
  }
}

function slugLockKey(def: ContentEntityDef, slug: string): string {
  return `content-slug:${def.slugKind}:${slug}`;
}

export function createContentWriteService(deps: ContentWriteDeps) {
  const notNullCache = new Map<string, Promise<Set<string>>>();
  const lockTimeoutMs = deps.lockTimeoutMs ?? 5_000;
  const statementTimeoutMs = deps.statementTimeoutMs ?? 15_000;
  const maxRetries = deps.maxRetries ?? 2;

  const notNullColumns = (q: TxQuery, table: string): Promise<Set<string>> => {
    let p = notNullCache.get(table);
    if (!p) {
      p = q(sqlNotNullColumns(table).text, sqlNotNullColumns(table).values).then(
        (r) => new Set(r.rows.map((x) => String(x.column_name)))
      );
      p.catch(() => notNullCache.delete(table));
      notNullCache.set(table, p);
    }
    return p;
  };

  function prepare(items: readonly ContentWriteItem[]): Prepared[] {
    const seen = new Set<string>();
    const out: Prepared[] = [];
    items.forEach((item, index) => {
      const def = CONTENT_ENTITY_BY_KEY[item?.entity as ContentEntityKey];
      if (!def) throw new WriteFailure("validation", `Bilinmeyen içerik türü: ${String(item?.entity)}`, "entity", index);
      const id = canonicalParentId(item.parentId, def.parentIdType);
      if (!id) throw new WriteFailure("validation", "Geçersiz kayıt kimliği", "parentId", index);
      if (!isSupportedLocale(item.locale)) throw new WriteFailure("validation", `Geçersiz dil: ${String(item.locale)}`, "locale", index);
      const v = validateContentPayload(def, item.locale, item.patch);
      if (!v.ok) throw new WriteFailure("validation", v.error, v.field, index);
      const key = `${def.key}|${id}|${item.locale}`;
      if (seen.has(key)) throw new WriteFailure("validation", "Aynı kayıt ve dil bir istekte iki kez yazılamaz", undefined, index);
      seen.add(key);
      out.push({ index, def, id, locale: item.locale, payload: v.value, order: ENTITY_ORDER.get(def.key)! });
    });
    return out;
  }

  function prepareTechnical(list: readonly ContentTechnicalPatch[]): PreparedTechnical[] {
    const out: PreparedTechnical[] = [];
    const seen = new Set<string>();
    for (const t of list) {
      const def = CONTENT_ENTITY_BY_KEY[t?.entity as ContentEntityKey];
      if (!def) throw new WriteFailure("validation", "Bilinmeyen içerik türü (teknik)", "entity");
      if (!deps.enabled(def.key)) throw new WriteFailure("disabled", `Merkezi içerik yazma servisi bu modül için kapalı: ${def.key}`);
      const id = canonicalParentId(t.parentId, def.parentIdType);
      if (!id) throw new WriteFailure("validation", "Geçersiz kayıt kimliği (teknik)", "parentId");
      const contentCols = new Set(def.fields.map((f) => f.baseColumn));
      const keys = Object.keys(t.values ?? {}).filter((k) => t.values[k] !== undefined);
      for (const k of keys) {
        if (k === "id" || k === "slug" || contentCols.has(k) || !/^[a-z_][a-z0-9_]{0,62}$/.test(k)) {
          throw new WriteFailure("validation", `Teknik kolon olarak yazılamaz: ${k}`, k);
        }
      }
      if (keys.length === 0) continue;
      const key = `${def.key}|${id}`;
      if (seen.has(key)) throw new WriteFailure("validation", "Aynı kayıt için iki teknik güncelleme");
      seen.add(key);
      out.push({
        def,
        id,
        values: Object.fromEntries(keys.map((k) => [k, t.values[k]])),
        jsonColumns: t.jsonColumns ?? [],
        order: ENTITY_ORDER.get(def.key)!,
      });
    }
    return out;
  }

  /** Deterministik sıra: (registry sırası, kanonik kimlik, dil). */
  function sorted(prepared: Prepared[]): Prepared[] {
    const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
    return [...prepared].sort(
      (a, b) =>
        a.order - b.order ||
        (a.def.parentIdType === "smallint" ? Number(a.id) - Number(b.id) : cmp(a.id, b.id)) ||
        CONTENT_LOCALES.indexOf(a.locale) - CONTENT_LOCALES.indexOf(b.locale)
    );
  }

  async function writeOne(q: TxQuery, p: Prepared, mode: ContentMirrorModeValue): Promise<ContentWriteResult> {
    const { def, id, locale, payload } = p;
    const target = contentWriteTarget(locale, mode);
    const run = (s: { text: string; values: unknown[] }) => q(s.text, s.values);

    /* NOT NULL: ana tablo kolonu (TR; her iki modda — translations
       modunda 106 aynası NULL'ı COALESCE ile yutar, TR satırı ile ana
       kolon ayrışmasın diye burada reddedilir) + çeviri tablosu kolonu. */
    const nullFields = Object.entries(payload.fields).filter(([, v]) => v === null).map(([k]) => k);
    if (nullFields.length > 0) {
      const trNN = await notNullColumns(q, def.table);
      const baseNN = locale === BASE_MIRROR_LOCALE ? await notNullColumns(q, def.parentTable) : new Set<string>();
      for (const f of nullFields) {
        const baseCol = def.fields.find((x) => x.name === f)!.baseColumn;
        if (trNN.has(f) || baseNN.has(baseCol)) {
          throw new WriteFailure("validation", `${f} boş bırakılamaz (NULL kabul edilmiyor)`, f, p.index);
        }
      }
    }

    /* Slug kuralları (Faz 5): ana tablo `slug` = TEKNİK ANAHTAR, servis
       onu ASLA yazmaz. TR/EN/DE URL slug'ı kendi çeviri satırındadır. */
    if (payload.slug !== undefined) {
      if (target === "base") {
        const cap = await run(sqlSlugSeparationCapability());
        if (cap.rows[0]?.ok !== true) {
          throw new WriteFailure(
            "guard",
            "TR URL slug'ı teknik anahtardan ayrı yazılamıyor: veritabanında migration 108 (dil slug ayrımı) yok",
            "slug",
            p.index
          );
        }
      }
      if (payload.slug !== null) {
        const s = payload.slug;
        if ((await run(sqlSlugTakenInBase(def, s, id))).rows.length > 0) {
          throw new WriteFailure("conflict", `"${s}" başka bir kaydın teknik anahtarı olarak kullanılıyor`, "slug", p.index);
        }
        if ((await run(sqlSlugTakenInTranslation(def, s, locale, id))).rows.length > 0) {
          throw new WriteFailure("conflict", `"${s}" bu dilde başka bir kayıt tarafından kullanılıyor`, "slug", p.index);
        }
      }
    }

    const written = [...Object.keys(payload.fields), ...(payload.slug !== undefined ? ["slug"] : [])];
    let created: boolean;

    if (target === "base") {
      const before = await run(sqlTranslationRow(def, id, BASE_MIRROR_LOCALE));
      if (Object.keys(payload.fields).length > 0) {
        await run(sqlUpdateBase(def, id, payload.fields, undefined));
      }
      if (payload.slug !== undefined) {
        const u = await run(sqlUpdateMirrorSlug(def, id, BASE_MIRROR_LOCALE, payload.slug));
        if (!u.rowCount) {
          throw new WriteFailure("not-found", "TR çeviri satırı yok (ayna henüz oluşturmamış)", "slug", p.index);
        }
      }
      const after = await run(sqlTranslationRow(def, id, BASE_MIRROR_LOCALE));
      created = before.rows.length === 0 && after.rows.length > 0;
    } else {
      const r = await run(sqlUpsertTranslation(def, id, locale, payload.fields, payload.slug));
      created = r.rows[0]?.inserted === true;
    }

    return {
      ok: true,
      created,
      target,
      mode,
      written,
      ...(payload.slug !== undefined ? { slug: payload.slug } : {}),
    };
  }

  async function execute(prepared: Prepared[], technical: PreparedTechnical[] = []): Promise<ContentWriteResult[]> {
    const order = sorted(prepared);
    return deps.transaction(async (q) => {
      for (const s of sqlTxSettings(lockTimeoutMs, statementTimeoutMs)) await q(s.text, s.values);
      const modeRow = await q(sqlMirrorMode().text, sqlMirrorMode().values);
      const mode = modeRow.rows[0]?.mode as ContentMirrorModeValue;
      if (!MODES.includes(mode)) throw new WriteFailure("guard", `Bilinmeyen ayna modu: ${String(mode)}`);

      /* 3) ana kayıt kilitleri — deterministik, tekrarsız (içerik + teknik) */
      const cmp = (a: { order: number; id: string; def: ContentEntityDef }, b: { order: number; id: string; def: ContentEntityDef }) =>
        a.order - b.order ||
        (a.def.parentIdType === "smallint" ? Number(a.id) - Number(b.id) : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      const lockList = [
        ...order.map((p) => ({ def: p.def, id: p.id, order: p.order, index: p.index as number | undefined })),
        ...technical.map((t) => ({ def: t.def, id: t.id, order: t.order, index: undefined as number | undefined })),
      ].sort(cmp);
      const locked = new Set<string>();
      for (const p of lockList) {
        const k = `${p.def.key}|${p.id}`;
        if (locked.has(k)) continue;
        const r = await q(sqlLockParent(p.def, p.id).text, sqlLockParent(p.def, p.id).values);
        if (r.rows.length === 0) throw new WriteFailure("not-found", "Ana kayıt bulunamadı", undefined, p.index);
        locked.add(k);
      }

      /* 3b) teknik kolonlar (içerik DIŞI) — aynı sırayla */
      for (const t of [...technical].sort(cmp)) {
        const u = sqlUpdateTechnical(t.def, t.id, t.values, t.jsonColumns);
        try {
          await q(u.text, u.values);
        } catch (err) {
          if ((err as PgError)?.code === "40P01") throw err;
          throw mapPgError(err);
        }
      }

      /* 4) slug kilitleri — anahtar sırasıyla */
      const slugKeys = [
        ...new Set(order.filter((p) => typeof p.payload.slug === "string").map((p) => slugLockKey(p.def, p.payload.slug as string))),
      ].sort();
      for (const key of slugKeys) await q(sqlSlugAdvisoryLock(key).text, sqlSlugAdvisoryLock(key).values);

      /* 5) yazmalar */
      const results: ContentWriteResult[] = new Array(prepared.length);
      for (const p of order) {
        try {
          results[p.index] = await writeOne(q, p, mode);
        } catch (err) {
          if ((err as PgError)?.code === "40P01") throw err; // yeniden denensin
          throw mapPgError(err, p.index);
        }
      }
      return results;
    });
  }

  async function saveContentMany(
    items: readonly ContentWriteItem[],
    ctx: ContentWriteCtx,
    opts?: { technical?: readonly ContentTechnicalPatch[] }
  ): Promise<{ ok: true; results: ContentWriteResult[] } | (ContentWriteResult & { ok: false })> {
    const disabledEntity = (Array.isArray(items) ? items : []).find(
      (i) => CONTENT_ENTITY_BY_KEY[i?.entity as ContentEntityKey] && !deps.enabled(i.entity)
    );
    if (disabledEntity) {
      return {
        ok: false,
        code: "disabled",
        error: `Merkezi içerik yazma servisi bu modül için kapalı: ${disabledEntity.entity}`,
      };
    }
    if (!ctx || typeof ctx.actorId !== "string" || ctx.actorId.trim() === "") {
      return { ok: false, code: "validation", error: "actorId zorunlu", field: "actorId" };
    }
    const technicalInput = opts?.technical ?? [];
    if (!Array.isArray(items) || (items.length === 0 && technicalInput.length === 0)) {
      return { ok: false, code: "validation", error: "Yazılacak öğe yok" };
    }
    let prepared: Prepared[];
    let technical: PreparedTechnical[];
    try {
      prepared = prepare(items);
      technical = prepareTechnical(technicalInput);
    } catch (err) {
      const f = mapPgError(err);
      return { ok: false, code: f.code, error: f.message, field: f.field, index: f.index };
    }

    for (let attempt = 0; ; attempt++) {
      try {
        const results = await execute(prepared, technical);
        try {
          await deps.onCommitted?.({
            entities: [...new Set([...prepared.map((p) => p.def.key), ...technical.map((t) => t.def.key)])],
            slugChanged: prepared.some((p) => p.payload.slug !== undefined),
          });
        } catch (err) {
          deps.onError?.(err, "onCommitted");
        }
        return { ok: true, results };
      } catch (err) {
        const code = (err as PgError)?.code;
        if (code === "40P01" && attempt < maxRetries) continue;
        const f = mapPgError(err);
        if (f.code === "db") deps.onError?.(err, "saveContentMany");
        return { ok: false, code: f.code, error: f.message, field: f.field, index: f.index };
      }
    }
  }

  async function saveContent(
    entity: ContentEntityKey,
    parentId: string,
    locale: Locale,
    patch: ContentWriteItem["patch"],
    ctx: ContentWriteCtx
  ): Promise<ContentWriteResult> {
    const r = await saveContentMany([{ entity, parentId, locale, patch }], ctx);
    if (!r.ok) {
      const { index: _index, ...rest } = r;
      void _index;
      return rest;
    }
    return r.results[0];
  }

  /**
   * Faz 5 — YENİ KAYIT: ana kayıt + içerik TEK transaction'da.
   *   technical : içerik DIŞI ana tablo kolonları (sunucu kodu kurar; ör.
   *               teknik anahtar `slug`, sıra, ilişki kolonları). İçerik
   *               kolonu veya `id` verilemez.
   *   locales   : her dil için içerik (genelde ana dil + isteğe bağlı diğerleri).
   * Ana tablodaki NOT NULL içerik kolonları için yer tutucu ('' / []) yazılır
   * (onaylı karar: ana dil TR değilse TR aynası boş başlar → okuma tarafında
   * "eksik çeviri"). base modunda 106/108 aynası tr satırını INSERT'te oluşturur.
   */
  async function createContent(
    input: {
      entity: ContentEntityKey;
      technical: Record<string, unknown>;
      locales: readonly { locale: Locale; patch: ContentWriteItem["patch"] }[];
    },
    ctx: ContentWriteCtx
  ): Promise<{ ok: true; id: string; results: ContentWriteResult[] } | (ContentWriteResult & { ok: false })> {
    const def = CONTENT_ENTITY_BY_KEY[input?.entity as ContentEntityKey];
    if (!def) return { ok: false, code: "validation", error: "Bilinmeyen içerik türü", field: "entity" };
    if (!deps.enabled(def.key)) {
      return { ok: false, code: "disabled", error: `Merkezi içerik yazma servisi bu modül için kapalı: ${def.key}` };
    }
    if (!ctx || typeof ctx.actorId !== "string" || ctx.actorId.trim() === "") {
      return { ok: false, code: "validation", error: "actorId zorunlu", field: "actorId" };
    }
    const contentCols = new Set(def.fields.map((f) => f.baseColumn));
    for (const k of Object.keys(input.technical ?? {})) {
      if (k === "id" || contentCols.has(k) || !/^[a-z_][a-z0-9_]{0,62}$/.test(k)) {
        return { ok: false, code: "validation", error: `Teknik kolon olarak yazılamaz: ${k}`, field: k };
      }
    }
    const handle = input.technical?.slug;
    if (def.slugKind && (typeof handle !== "string" || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(handle) || handle.length > 160)) {
      return { ok: false, code: "validation", error: "Teknik anahtar (slug) geçerli olmalı", field: "slug" };
    }
    const seen = new Set<string>();
    const payloads: { locale: Locale; payload: ValidatedContentPayload; index: number }[] = [];
    for (const [index, l] of (input.locales ?? []).entries()) {
      if (seen.has(l.locale)) return { ok: false, code: "validation", error: "Aynı dil iki kez", index };
      seen.add(l.locale);
      const v = validateContentPayload(def, l.locale, l.patch);
      if (!v.ok) return { ok: false, code: "validation", error: v.error, field: v.field, index };
      payloads.push({ locale: l.locale as Locale, payload: v.value, index });
    }
    if (payloads.length === 0) return { ok: false, code: "validation", error: "En az bir dilde içerik gerekli" };

    const run = async () =>
      deps.transaction(async (q) => {
        for (const st of sqlTxSettings(lockTimeoutMs, statementTimeoutMs)) await q(st.text, st.values);
        const mode = (await q(sqlMirrorMode().text, sqlMirrorMode().values)).rows[0]?.mode as ContentMirrorModeValue;
        if (!MODES.includes(mode)) throw new WriteFailure("guard", `Bilinmeyen ayna modu: ${String(mode)}`);
        if (typeof handle === "string") {
          const lk = sqlSlugAdvisoryLock(`content-handle:${def.slugKind}:${handle}`);
          await q(lk.text, lk.values);
          const nil = def.parentIdType === "smallint" ? "0" : "00000000-0000-0000-0000-000000000000";
          const t = sqlSlugTakenInBase(def, handle, nil);
          if ((await q(t.text, t.values)).rows.length > 0) {
            throw new WriteFailure("conflict", `"${handle}" teknik anahtarı kullanılıyor`, "slug");
          }
        }
        const nn = await notNullColumns(q, def.parentTable);
        const placeholders: Record<string, unknown> = {};
        for (const f of def.fields) {
          if (nn.has(f.baseColumn) && !(f.baseColumn in input.technical)) {
            placeholders[f.baseColumn] = f.kind === "jsonb" ? [] : "";
          }
        }
        const ins = sqlInsertParent(def, input.technical, placeholders);
        const newId = String((await q(ins.text, ins.values)).rows[0]?.id ?? "");
        if (!newId) throw new WriteFailure("db", "Ana kayıt oluşturulamadı");
        const lock = sqlLockParent(def, newId);
        await q(lock.text, lock.values);
        const prepared: Prepared[] = payloads.map((x) => ({
          index: x.index,
          def,
          id: canonicalParentId(newId, def.parentIdType)!,
          locale: x.locale,
          payload: x.payload,
          order: ENTITY_ORDER.get(def.key)!,
        }));
        const slugKeys = [
          ...new Set(prepared.filter((x) => typeof x.payload.slug === "string").map((x) => slugLockKey(def, x.payload.slug as string))),
        ].sort();
        for (const key of slugKeys) await q(sqlSlugAdvisoryLock(key).text, sqlSlugAdvisoryLock(key).values);
        const results: ContentWriteResult[] = new Array(prepared.length);
        for (const x of sorted(prepared)) {
          try {
            results[x.index] = await writeOne(q, x, mode);
          } catch (err) {
            if ((err as PgError)?.code === "40P01") throw err;
            throw mapPgError(err, x.index);
          }
        }
        return { id: newId, results };
      });

    for (let attempt = 0; ; attempt++) {
      try {
        const r = await run();
        try {
          await deps.onCommitted?.({ entities: [def.key], slugChanged: def.slugKind !== undefined });
        } catch (err) {
          deps.onError?.(err, "onCommitted");
        }
        return { ok: true, id: r.id, results: r.results };
      } catch (err) {
        if ((err as PgError)?.code === "40P01" && attempt < maxRetries) continue;
        const f = mapPgError(err);
        if (f.code === "db") deps.onError?.(err, "createContent");
        return { ok: false, code: f.code, error: f.message, field: f.field, index: f.index };
      }
    }
  }

  async function getContentWriteConfig(): Promise<ContentWriteConfig> {
    let mode: ContentMirrorModeValue | null = null;
    try {
      mode = await deps.transaction(async (q) => {
        const r = await q(sqlMirrorMode().text, sqlMirrorMode().values);
        const m = r.rows[0]?.mode as ContentMirrorModeValue;
        return MODES.includes(m) ? m : null;
      });
    } catch (err) {
      deps.onError?.(err, "getContentWriteConfig");
    }
    return {
      enabled: CONTENT_ENTITIES.some((e) => deps.enabled(e.key)),
      mode,
      locales: CONTENT_LOCALES,
      entities: CONTENT_ENTITIES.map((def) => ({
        key: def.key,
        table: def.table,
        parentTable: def.parentTable,
        fields: def.fields.map((f) => f.name),
        slug: !!def.slugKind,
        writeEnabled: deps.enabled(def.key),
        targets: mode
          ? (Object.fromEntries(CONTENT_LOCALES.map((l) => [l, contentWriteTarget(l, mode!)])) as Record<
              Locale,
              "base" | "translation"
            >)
          : null,
      })),
    };
  }

  return { saveContent, saveContentMany, createContent, getContentWriteConfig };
}

export type ContentWriteServiceInstance = ReturnType<typeof createContentWriteService>;
