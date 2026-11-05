import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  type Locale,
} from "@/lib/i18n/config";
import type { SlugKind } from "@/lib/i18n/routing/route-registry";

/* ===============================================================
   🌐 ROUTING CONTEXT — Çok Dilli Mimari Faz 2
   ===============================================================
   URL üretimi/çözümü için gereken SİTE GENELİ yapılandırma:
     • root     — kök URL'de (/) çalışan ana dil
     • enabled  — yayındaki diller
     • slugs    — dil bazlı içerik slug'ları (taban/TR slug → dil → slug)

   NEDEN MODÜL DÜZEYİNDE BİR "GÜNCEL BAĞLAM":
     Bu değerler istekten değil SİTE AYARINDAN gelir (her istek için
     aynıdır). `localeHref` / `buildLocaleAlternates` gibi senkron ve
     onlarca yerde (server + client) kullanılan yardımcılara bağlamı
     tek tek geçirmek yerine, bağlam:
       • server'da  → `primeRoutingContext()` (cache'li ayar + slug
                      haritası; layout, [lang] route'ları, sitemap,
                      robots ve 404 başında çağrılır),
       • client'ta  → `PublicRoutingProvider` (render sırasında)
     tarafından güncellenir. Varsayılan bağlam bugünkü davranıştır
     (TR kök, tüm diller, çeviri slug'ı yok) → bağlam hiç kurulmasa
     bile URL'ler geçerli kalır.
   =============================================================== */

export type LocalizedSlugMap = Partial<
  Record<SlugKind, Record<string, Partial<Record<Locale, string>>>>
>;

/** Slug geçmişi (migration 103): tür → dil → eski slug → GÜNCEL taban
 *  slug (yalnız yayındaki içerikler). "tr" girdileri taban slug geçmişidir
 *  ve kendi dil slug'ı olmayan diller için de geçerlidir. */
export type RedirectMap = Partial<
  Record<SlugKind, Partial<Record<Locale, Record<string, string>>>>
>;

export type RoutingContext = {
  root: Locale;
  enabled: readonly Locale[];
  slugs: LocalizedSlugMap;
  /** Faz 3 — slug değişiklik geçmişi (yoksa yönlendirme yok). */
  redirects?: RedirectMap;
  /** Faz 3 son kontrol — YAYINDAKİ içeriklerin taban slug'ları (yalnız
   *  proxy yükler). Bir tür yoksa o tür için proxy 404 kontrolü yapmaz. */
  live?: LiveSlugSets;
};

export type LiveSlugSets = Partial<Record<SlugKind, ReadonlySet<string>>>;

export const DEFAULT_ROUTING_CONTEXT: RoutingContext = Object.freeze({
  root: DEFAULT_LOCALE,
  enabled: SUPPORTED_LOCALES,
  slugs: {},
  redirects: {},
});

let current: RoutingContext = DEFAULT_ROUTING_CONTEXT;

export function setRoutingContext(next: RoutingContext | null | undefined): void {
  current = next ?? DEFAULT_ROUTING_CONTEXT;
}

export function getRoutingContext(): RoutingContext {
  return current;
}

/* ---------- Ters indeks (dil slug'ı → taban slug) ---------- */

type ReverseIndex = Partial<
  Record<SlugKind, Partial<Record<Locale, Map<string, string>>>>
>;

const reverseCache = new WeakMap<LocalizedSlugMap, ReverseIndex>();

function reverseOf(slugs: LocalizedSlugMap): ReverseIndex {
  const hit = reverseCache.get(slugs);
  if (hit) return hit;
  const out: ReverseIndex = {};
  for (const kind of Object.keys(slugs) as SlugKind[]) {
    const byBase = slugs[kind] ?? {};
    const perLocale: Partial<Record<Locale, Map<string, string>>> = {};
    for (const [base, locales] of Object.entries(byBase)) {
      for (const [loc, slug] of Object.entries(locales ?? {})) {
        if (!slug) continue;
        const m = (perLocale[loc as Locale] ??= new Map());
        m.set(slug, base);
      }
    }
    out[kind] = perLocale;
  }
  reverseCache.set(slugs, out);
  return out;
}

/* ===============================================================
   🌐 Faz 6 Dalga 1 — SİMETRİK SLUG ÇÖZÜMLEME (TR özel durumu YOK)
   ===============================================================
   Gelen bir slug'ın teknik anahtarı (taban) şu sırayla aranır:
     1) isteğin dilinin KENDİ slug'ı                       (own)
     2) teknik anahtarın kendisi — URL çözümlemesinde güvenli yedek;
        o dilin kendi slug'ı yoksa o dilin kanonik URL'si zaten
        teknik anahtardır                                  (own | base)
     3) isteğin dilindeki slug GEÇMİŞİ (url_redirects)       (history)
     4) AKTİF başka bir dilin slug'ı — yalnız TEK kayda işaret
        ediyorsa (doğrulanmış eşleşme)                     (other)
     5) AKTİF başka dillerin slug geçmişi — yalnız TEK kayda işaret
        ediyorsa                                           (history)
   Pasif dillerin slug'ları ve geçmişleri KULLANILMAZ. Birden fazla
   kayda işaret eden (çakışan) slug ÇÖZÜMLENMEZ → bilinmeyen (404):
   yanlış kayda yönlendirme üretilmez. Kendi dilin geçmişi, başka
   dilin GÜNCEL slug'ından önce gelir (eski DE slug'ı bugün başka bir
   villanın EN slug'ı olsa bile DE isteği doğru villaya gider). */

type Resolution = { base: string; source: SlugSource } | null;

function otherEnabledLocales(ctx: RoutingContext, locale: Locale): Locale[] {
  return SUPPORTED_LOCALES.filter((l) => l !== locale && ctx.enabled.includes(l));
}

/** Tek kayda işaret eden eşleşme (yoksa / çakışırsa null). */
function uniqueTarget(targets: readonly (string | undefined)[]): string | null | "conflict" {
  const set = new Set(targets.filter((t): t is string => !!t));
  if (set.size === 0) return null;
  if (set.size > 1) return "conflict";
  return [...set][0];
}

function resolveSlug(ctx: RoutingContext, kind: SlugKind, slug: string, locale: Locale): Resolution {
  const rev = reverseOf(ctx.slugs)[kind];
  const own = rev?.[locale]?.get(slug);
  if (own) return { base: own, source: "own" };
  const entry = ctx.slugs[kind]?.[slug];
  if (entry !== undefined || isKnownBase(ctx, kind, slug)) {
    /* Teknik anahtar: bu dilin kendi slug'ı yoksa kanonik URL odur. */
    return { base: slug, source: entry?.[locale] ? "base" : "own" };
  }
  const history = ctx.redirects?.[kind];
  const ownHistory = history?.[locale]?.[slug];
  if (ownHistory) return { base: ownHistory, source: "history" };
  const others = otherEnabledLocales(ctx, locale);
  const other = uniqueTarget(others.map((l) => rev?.[l]?.get(slug)));
  if (other === "conflict") return null;
  if (other) return { base: other, source: "other" };
  const otherHistory = uniqueTarget(others.map((l) => history?.[l]?.[slug]));
  if (otherHistory && otherHistory !== "conflict") return { base: otherHistory, source: "history" };
  return null;
}

/** Slug haritasında satırı olmayan (hiçbir dilde çeviri slug'ı yok) ama
 *  yayında olan teknik anahtarlar: canlı küme (proxy) varsa oradan. */
function isKnownBase(ctx: RoutingContext, kind: SlugKind, slug: string): boolean {
  return !!ctx.live?.[kind]?.has(slug);
}

/** Dil slug'ını (veya teknik anahtarı) teknik anahtara çevirir.
 *  Çözülemeyen / çakışan slug olduğu gibi döner (içerik yoksa 404). */
export function toBaseSlug(
  ctx: RoutingContext,
  kind: SlugKind,
  slug: string,
  locale: Locale
): string {
  return resolveSlug(ctx, kind, slug, locale)?.base ?? slug;
}

/** `toBaseSlug` ile AYNI sırayla slug'ın KAYNAĞI:
 *    own     — bu dilin kanonik slug'ı (kendi slug'ı; o dilin kendi
 *              slug'ı yoksa teknik anahtar)
 *    base    — teknik anahtar, ama bu dilin KENDİ (farklı) slug'ı var
 *    other   — aktif başka bir dilin slug'ı (tek kayıt)
 *    history — slug geçmişi (url_redirects)
 *    unknown — hiçbiri / çakışma (taban kabul edilir; içerik yoksa 404)
 *  Proxy, ana dile bağlı (öneksiz) yollarda başka dilin slug'ından
 *  doğan yönlendirmeyi GEÇİCİ (307) yapar. */
export type SlugSource = "own" | "base" | "other" | "history" | "unknown";

export function slugSource(
  ctx: RoutingContext,
  kind: SlugKind,
  slug: string,
  locale: Locale
): SlugSource {
  return resolveSlug(ctx, kind, slug, locale)?.source ?? "unknown";
}

/** Slug'ın AİT OLDUĞU aktif dil (`locale` dışında):
 *    • başka dilin slug'ı → o dil;
 *    • teknik anahtar (bu dilin kendi slug'ı var) → teknik anahtarı
 *      KANONİK URL olarak kullanan (kendi slug'ı olmayan) ilk aktif dil.
 *  TR'ye özel kural YOK. */
export function slugOwnerLocale(
  ctx: RoutingContext,
  kind: SlugKind,
  slug: string,
  locale: Locale
): Locale | null {
  const src = slugSource(ctx, kind, slug, locale);
  const others = otherEnabledLocales(ctx, locale);
  if (src === "base") {
    /* Faz 7 R-B — sahip önceliği (teknik anahtar = `slug`):
         1) slug'ı KENDİ çeviri satırında taşıyan aktif dil (gerçek sahip);
         2) slug'ı KENDİ geçmişinde taşıyan aktif dil (o dil bu URL'yi
            daha önce kullandı → o dilin güncel sayfası);
         3) kendi slug'ı olmadığı için teknik anahtarı kanonik kullanan dil
            (önceki kural; ana dil değişimi senaryoları aynen korunur).
       Böylece dil slug'ı teknik anahtardan ayrılmış (ör. 108 sonrası TR
       slug değişikliği) bir kaydın eski URL'si, yalnız yedek olarak teknik
       anahtarı kullanan BAŞKA bir dile gönderilmez. */
    const real = others.find((l) => ctx.slugs[kind]?.[slug]?.[l] === slug);
    if (real) return real;
    const historic = others.find((l) => ctx.redirects?.[kind]?.[l]?.[slug] === slug);
    if (historic) return historic;
    return others.find((l) => slugSource(ctx, kind, slug, l) === "own") ?? null;
  }
  if (src !== "other") return null;
  const rev = reverseOf(ctx.slugs)[kind];
  return others.find((l) => !!rev?.[l]?.get(slug)) ?? null;
}

/** Faz 7 R-B — teknik anahtar `slug`, `locale` dilinin KENDİ slug
 *  geçmişinde mi? (O dilin slug'ı eskiden teknik anahtardı; sonra kalıcı
 *  olarak değiştirildi — ör. 108 sonrası TR slug değişikliği.) Geçmiş
 *  kaydı aynı kayda işaret etmelidir (eski slug = teknik anahtar). */
export function ownHistoryHasTechnicalKey(
  ctx: RoutingContext,
  kind: SlugKind,
  slug: string,
  locale: Locale
): boolean {
  return ctx.redirects?.[kind]?.[locale]?.[slug] === slug;
}

/** Faz 5 — slug bu dilin KENDİ (çeviri satırındaki) slug'ı ise teknik
 *  anahtarı; değilse null. Yedek/geçmiş araması YAPMAZ. */
export function ownLocaleSlugBase(
  ctx: RoutingContext,
  kind: SlugKind,
  slug: string,
  locale: Locale
): string | null {
  return reverseOf(ctx.slugs)[kind]?.[locale]?.get(slug) ?? null;
}

/** Taban slug'ın verilen dildeki SEO slug'ı (yoksa taban). */
export function toLocalizedSlug(
  ctx: RoutingContext,
  kind: SlugKind,
  baseSlug: string,
  locale: Locale
): string {
  /* Faz 5: TR özel durumu yok — her dil kendi slug'ı, yoksa teknik anahtar. */
  return ctx.slugs[kind]?.[baseSlug]?.[locale] || baseSlug;
}
