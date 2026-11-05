import type { Metadata } from "next";

import type { ArchiveSearchParams } from "@/app/components/search/KiralikVillalarPageBody";
import TaxonomyLandingPageBody, {
  buildTaxonomyLandingMetadata,
} from "@/app/components/search/TaxonomyLandingPageBody";
import type { LocaleRouteProps, UnifiedLocalePageModule } from "@/lib/i18n/routing/locale-route";

/* 🌐 Faz 6 Dalga 2 — KATEGORİ (villa tipi) SEO LANDING: TEK, dile duyarlı
   route (route anahtarı: "villaType"). Eski üç kopya (`(public)/villa-
   turleri/[slug]`, `(public)/en|de/…` `locale-page.tsx`) yerine. Dil
   dispatcher'dan AÇIKÇA gelir; `params.slug` TEKNİK ANAHTARDIR (dil slug'ı
   dispatcher'da çözülür, kanonik değilse 308). Kategori adı merkezi
   servisten (TaxonomyLandingPageBody); liste/sıralama/sayfalama AYNEN. */
export function VillaTypeRoutePage({ locale, params, searchParams }: LocaleRouteProps) {
  return (
    <TaxonomyLandingPageBody
      kind="category"
      slug={params.slug}
      locale={locale}
      searchParams={searchParams as ArchiveSearchParams}
    />
  );
}

export async function villaTypeRouteMetadata({ locale, params, searchParams }: LocaleRouteProps): Promise<Metadata> {
  return buildTaxonomyLandingMetadata("category", params.slug, locale, searchParams as ArchiveSearchParams);
}

export const villaTypeRouteModule: UnifiedLocalePageModule = {
  Page: VillaTypeRoutePage,
  generateMetadata: villaTypeRouteMetadata,
};
