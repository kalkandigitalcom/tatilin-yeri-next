import type { Metadata } from "next";

import type { ArchiveSearchParams } from "@/app/components/search/KiralikVillalarPageBody";
import TaxonomyLandingPageBody, {
  buildTaxonomyLandingMetadata,
} from "@/app/components/search/TaxonomyLandingPageBody";
import type { LocaleRouteProps, UnifiedLocalePageModule } from "@/lib/i18n/routing/locale-route";

/* 🌐 Faz 6 Dalga 2 — BÖLGE (grup kökü) SEO LANDING: TEK, dile duyarlı
   route (route anahtarı: "region"). Eski üç kopya (`(public)/bolgeler/
   [slug]`, `(public)/en|de/…` `locale-page.tsx`) yerine; dil dispatcher'dan
   AÇIKÇA gelir. Bölge adları ve slug'ları dil bağımsız ÖZEL İSİMDİR
   (Phase 10I) — merkezi içerik servisine girmez; bölge sorguları,
   grup kuralı ve ilişkiler (lib/taxonomy-landing.server) DEĞİŞMEDİ. */
export function RegionRoutePage({ locale, params, searchParams }: LocaleRouteProps) {
  return (
    <TaxonomyLandingPageBody
      kind="region"
      slug={params.slug}
      locale={locale}
      searchParams={searchParams as ArchiveSearchParams}
    />
  );
}

export async function regionRouteMetadata({ locale, params, searchParams }: LocaleRouteProps): Promise<Metadata> {
  return buildTaxonomyLandingMetadata("region", params.slug, locale, searchParams as ArchiveSearchParams);
}

export const regionRouteModule: UnifiedLocalePageModule = {
  Page: RegionRoutePage,
  generateMetadata: regionRouteMetadata,
};
