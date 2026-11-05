import type { Metadata } from "next";
import FavoritesPageBody from "@/app/components/favorites/FavoritesPageBody";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import type { Locale } from "@/lib/i18n/config";
import type { LocaleRouteProps, UnifiedLocalePageModule } from "@/lib/i18n/routing/locale-route";

/* 🌐 Faz 6 Dalga 1 — TEK, DİLE DUYARLI route (route anahtarı: "favorites").
   Eski üç kopyanın metadata'sı BİREBİR: başlık/açıklama sözlükten, robots
   noindex/nofollow (kişiye özel içerik), canonical/hreflang YOK. */
export function favoritesRouteMetadata(locale: Locale): Metadata {
  return {
    title: getDictionary(locale).favoritesPage.metaTitle,
    description: getDictionary(locale).favoritesPage.metaDescription,
    robots: {
      index: false,
      follow: false,
      googleBot: { index: false, follow: false },
    },
  };
}

export function FavoritesRoutePage({ locale }: LocaleRouteProps) {
  return <FavoritesPageBody locale={locale} />;
}

/** Dispatcher'a verilen tek modül (Faz 6 Dalga 1). */
export const favoritesRouteModule: UnifiedLocalePageModule = { Page: FavoritesRoutePage, metadata: favoritesRouteMetadata };
