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

/** Dil slug'ını (veya taban slug'ı) taban slug'a çevirir.
 *  Önce verilen dilde, sonra diğer dillerde arar; bulunamazsa
 *  değerin kendisi taban kabul edilir. */
export function toBaseSlug(
  ctx: RoutingContext,
  kind: SlugKind,
  slug: string,
  locale: Locale
): string {
  const rev = reverseOf(ctx.slugs)[kind];
  const own = rev?.[locale]?.get(slug);
  if (own) return own;
  if (ctx.slugs[kind]?.[slug]) return slug;
  if (rev) {
    for (const l of SUPPORTED_LOCALES) {
      const other = rev[l]?.get(slug);
      if (other) return other;
    }
  }
  /* Faz 3 — canlı bir dil slug'ı değilse slug geçmişine bakılır:
     önce isteğin dili, sonra taban (TR) geçmişi. Hedef her zaman
     içeriğin GÜNCEL taban slug'ıdır → zincir yok. */
  const history = ctx.redirects?.[kind];
  const moved = history?.[locale]?.[slug] ?? history?.tr?.[slug];
  if (moved) return moved;
  return slug;
}

/** Faz 4 — `toBaseSlug` ile AYNI sırayla slug'ın KAYNAĞI:
 *    own     — bu dilin kendi slug'ı (TR için taban slug)
 *    base    — taban (TR) slug'ı, ama bu dil TR değil
 *    other   — başka bir dilin slug'ı
 *    history — slug geçmişi (url_redirects)
 *    unknown — hiçbiri (taban kabul edilir; içerik yoksa 404)
 *  Proxy, ana dile bağlı (öneksiz) yollarda başka dilin slug'ından
 *  doğan yönlendirmeyi GEÇİCİ (307) yapar: ana dil değişip geri
 *  alındığında tarayıcıda önbelleğe alınmış kalıcı yönlendirme döngü
 *  üretmesin. */
export type SlugSource = "own" | "base" | "other" | "history" | "unknown";

export function slugSource(
  ctx: RoutingContext,
  kind: SlugKind,
  slug: string,
  locale: Locale
): SlugSource {
  const rev = reverseOf(ctx.slugs)[kind];
  if (rev?.[locale]?.get(slug)) return "own";
  if (ctx.slugs[kind]?.[slug]) return locale === "tr" ? "own" : "base";
  if (rev) {
    for (const l of SUPPORTED_LOCALES) {
      if (rev[l]?.get(slug)) return "other";
    }
  }
  const history = ctx.redirects?.[kind];
  if (history?.[locale]?.[slug] ?? history?.tr?.[slug]) return "history";
  return locale === "tr" ? "own" : "unknown";
}

/** Faz 4 — slug'ın AİT OLDUĞU dil (`locale` dışında): taban slug → "tr"
 *  (o dilin kendi slug'ı varsa), başka dilin slug'ı → o dil. */
export function slugOwnerLocale(
  ctx: RoutingContext,
  kind: SlugKind,
  slug: string,
  locale: Locale
): Locale | null {
  const src = slugSource(ctx, kind, slug, locale);
  if (src === "base") return "tr";
  if (src !== "other") return null;
  const rev = reverseOf(ctx.slugs)[kind];
  for (const l of SUPPORTED_LOCALES) {
    if (l !== locale && rev?.[l]?.get(slug)) return l;
  }
  return null;
}

/** Taban slug'ın verilen dildeki SEO slug'ı (yoksa taban). */
export function toLocalizedSlug(
  ctx: RoutingContext,
  kind: SlugKind,
  baseSlug: string,
  locale: Locale
): string {
  if (locale === "tr") return baseSlug;
  return ctx.slugs[kind]?.[baseSlug]?.[locale] || baseSlug;
}
