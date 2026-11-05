import type { Metadata } from "next";
import OfferPageBody from "@/app/components/offer/OfferPageBody";
import { buildOfferMetadata } from "@/app/components/offer/offer-metadata";
import type { LocaleRouteProps, UnifiedLocalePageModule } from "@/lib/i18n/routing/locale-route";

/* 🌐 Faz 6 Dalga 1 — TEK, DİLE DUYARLI route (route anahtarı: "offer").
   Eski üç kopya (`(public)/teklif-al`, `(public)/en|de/teklif-al`
   `locale-page.tsx`) yerine: gövde ve metadata aynı ortak bileşenden,
   dil dispatcher'dan AÇIKÇA gelir. URL'ler değişmez (route kaydı). */
export function OfferRoutePage({ locale }: LocaleRouteProps) {
  return <OfferPageBody locale={locale} />;
}

export async function offerRouteMetadata({ locale }: LocaleRouteProps): Promise<Metadata> {
  return buildOfferMetadata(locale);
}

/** Dispatcher'a verilen tek modül (Faz 6 Dalga 1). */
export const offerRouteModule: UnifiedLocalePageModule = { Page: OfferRoutePage, generateMetadata: offerRouteMetadata };
