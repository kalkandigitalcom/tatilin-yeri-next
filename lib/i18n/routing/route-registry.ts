import type { Locale } from "@/lib/i18n/config";

/* ===============================================================
   🌐 ROUTE REGISTRY — Çok Dilli Mimari Faz 2 (TEK KAYNAK)
   ===============================================================
   Her public route için dil başına SEO URL desenleri. Bileşenler ve
   metadata URL'yi ASLA elle kurmaz; `lib/i18n/routing/url.ts`
   bu kayıttan üretir/çözer.

   DESEN SÖZDİZİMİ: segmentler "/" ile ayrılır, ":ad" parametredir.
   `tr` deseni aynı zamanda İÇ (Next route klasörü) desenidir:
   istek `app/(public)/[lang]/<tr deseni>`'ne rewrite edilir.

   `slugKind`: ":slug" parametresi dile göre çevrilebilen bir içerik
   slug'ı ise türü (çeviri tablosundaki `slug`, migration 102).
   Bölge (`region`) slug'ları özel isimdir, çevrilmez (Phase 10I).

   SIRA ÖNEMLİ: statik desenler, aynı önekteki parametreli
   desenlerden ÖNCE gelir (ör. booking/success → booking/:slug).

   Yeni dil: her desene o dilin karşılığı eklenir (TS zorunlu kılar).
   Bir desen değişirse eski URL'ler otomatik olarak yeni desene 308
   ile yönlenir (url.ts → resolveIncomingPath "başka desenle eşleşme").
   =============================================================== */

export type SlugKind = "villa" | "villaType" | "blog" | "page";

export type RouteKey =
  | "home"
  | "villas"
  | "villa"
  | "villaType"
  | "region"
  | "blog"
  | "blogPost"
  | "page"
  | "search"
  | "contact"
  | "offer"
  | "favorites"
  | "favoritesShare"
  | "reservationSuccess"
  | "reservation"
  | "reservationLookup"
  | "shortGaps"
  | "sharedList"
  | "privateVilla";

export type RouteDef = {
  key: RouteKey;
  patterns: Record<Locale, string>;
  slugKind?: SlugKind;
};

export const ROUTES: readonly RouteDef[] = [
  { key: "home", patterns: { tr: "", en: "", de: "" } },
  {
    key: "villas",
    patterns: { tr: "kiralik-villalar", en: "villas-for-rent", de: "ferienvillen" },
  },
  {
    key: "villa",
    patterns: { tr: "kiralik-villa/:slug", en: "villa/:slug", de: "villa/:slug" },
    slugKind: "villa",
  },
  {
    key: "villaType",
    patterns: {
      tr: "villa-turleri/:slug",
      en: "villa-types/:slug",
      de: "villa-typen/:slug",
    },
    slugKind: "villaType",
  },
  {
    key: "region",
    patterns: { tr: "bolgeler/:slug", en: "regions/:slug", de: "regionen/:slug" },
  },
  { key: "blog", patterns: { tr: "blog", en: "blog", de: "blog" } },
  {
    key: "blogPost",
    patterns: { tr: "blog/:slug", en: "blog/:slug", de: "blog/:slug" },
    slugKind: "blog",
  },
  {
    key: "page",
    patterns: { tr: "p/:slug", en: "p/:slug", de: "p/:slug" },
    slugKind: "page",
  },
  { key: "search", patterns: { tr: "arama", en: "search", de: "suche" } },
  { key: "contact", patterns: { tr: "iletisim", en: "contact", de: "kontakt" } },
  {
    key: "offer",
    patterns: { tr: "teklif-al", en: "request-a-quote", de: "angebot-anfordern" },
  },
  {
    key: "favoritesShare",
    patterns: {
      tr: "favoriler/paylas/:token",
      en: "favorites/share/:token",
      de: "favoriten/teilen/:token",
    },
  },
  { key: "favorites", patterns: { tr: "favoriler", en: "favorites", de: "favoriten" } },
  {
    key: "reservationSuccess",
    patterns: { tr: "rezervasyon/basarili", en: "booking/success", de: "buchung/erfolg" },
  },
  {
    key: "reservation",
    patterns: { tr: "rezervasyon/:slug", en: "booking/:slug", de: "buchung/:slug" },
    slugKind: "villa",
  },
  {
    key: "reservationLookup",
    patterns: {
      tr: "rezervasyon-kontrol",
      en: "booking-status",
      de: "buchungsstatus",
    },
  },
  {
    key: "shortGaps",
    patterns: {
      tr: "kisa-sureli-tarihler/:ay/:gece",
      en: "short-stays/:ay/:gece",
      de: "kurzaufenthalte/:ay/:gece",
    },
  },
  { key: "sharedList", patterns: { tr: "liste/:token", en: "liste/:token", de: "liste/:token" } },
  { key: "privateVilla", patterns: { tr: "v/:token", en: "v/:token", de: "v/:token" } },
];

export const ROUTE_BY_KEY: Readonly<Record<RouteKey, RouteDef>> = Object.fromEntries(
  ROUTES.map((r) => [r.key, r])
) as Record<RouteKey, RouteDef>;
