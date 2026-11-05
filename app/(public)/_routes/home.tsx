import type { Metadata } from "next";

import HomePageBody from "@/app/components/home/HomePageBody";
import { buildHomeMetadata } from "@/app/components/home/home-metadata";
import type { LocaleRouteProps, UnifiedLocalePageModule } from "@/lib/i18n/routing/locale-route";

/* 🌐 Faz 6 Dalga 4 — ANA SAYFA: TEK, dile duyarlı route modülü
   (route anahtarı: "home"). Eski üç kopya (`(public)/locale-page.tsx`,
   `(public)/en|de/locale-page.tsx`) aynı gövde/metadata yardımcılarını
   çağırıyordu. Pasif dil → dispatcher 404 (eski gate ile aynı); TR
   modülündeki `redirectsFromRoot` dalı Faz 2'den beri ölüydü (her zaman
   false) — kaldırıldı. Tasarım, sıralama ve bölüm düzeni AYNEN. */
export function HomeRoutePage({ locale }: LocaleRouteProps) {
  return <HomePageBody locale={locale} />;
}

export async function homeRouteMetadata({ locale }: LocaleRouteProps): Promise<Metadata> {
  return buildHomeMetadata(locale);
}

export const homeRouteModule: UnifiedLocalePageModule = {
  Page: HomeRoutePage,
  generateMetadata: homeRouteMetadata,
};
