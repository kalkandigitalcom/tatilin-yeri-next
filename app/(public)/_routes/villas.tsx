import type { Metadata } from "next";

import KiralikVillalarPageBody, {
  type ArchiveSearchParams,
} from "@/app/components/search/KiralikVillalarPageBody";
import { buildVillasArchiveMetadata } from "@/app/components/search/kiralik-villalar-metadata";
import type { LocaleRouteProps, UnifiedLocalePageModule } from "@/lib/i18n/routing/locale-route";

/* 🌐 Faz 6 Dalga 2 — VİLLA LİSTELEME: TEK, DİLE DUYARLI route
   (route anahtarı: "villas"). Eski üç kopya (`(public)/kiralik-villalar`,
   `(public)/en|de/kiralik-villalar` `locale-page.tsx`) zaten aynı gövde
   ve metadata yardımcısını çağırıyordu; dil artık dispatcher'dan AÇIKÇA
   gelir. Sıralama, sayfalama, fiyat/kur ve filtre mantığı gövdede AYNEN. */
export function VillasRoutePage({ locale, searchParams }: LocaleRouteProps) {
  return (
    <KiralikVillalarPageBody
      locale={locale}
      searchParams={searchParams as ArchiveSearchParams}
    />
  );
}

export async function villasRouteMetadata({ locale }: LocaleRouteProps): Promise<Metadata> {
  return buildVillasArchiveMetadata(locale);
}

export const villasRouteModule: UnifiedLocalePageModule = {
  Page: VillasRoutePage,
  generateMetadata: villasRouteMetadata,
};
