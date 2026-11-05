import { localeRouteFor } from "@/lib/i18n/routing/locale-route";
import { offerRouteModule } from "@/app/(public)/_routes/offer";

/* 🌐 Faz 6 Dalga 1 — tek, dile duyarlı route modülü (app/(public)/_routes/offer.tsx).
   Dil, slug ve kanonik kontrolü dispatcher'da; URL'ler route kaydından. */
const route = localeRouteFor("offer", offerRouteModule);

export const generateMetadata = route.generateMetadata;
export default route.Page;
