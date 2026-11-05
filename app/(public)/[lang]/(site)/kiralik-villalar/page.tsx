import { localeRouteFor } from "@/lib/i18n/routing/locale-route";
import { villasRouteModule } from "@/app/(public)/_routes/villas";

/* 🌐 Faz 6 Dalga 2 — tek, dile duyarlı route modülü (app/(public)/_routes/villas.tsx).
   Dil kontrolü dispatcher'da; URL'ler route kaydından. */
const route = localeRouteFor("villas", villasRouteModule);

export const generateMetadata = route.generateMetadata;
export default route.Page;
