import { localeRouteFor } from "@/lib/i18n/routing/locale-route";
import { villaTypeRouteModule } from "@/app/(public)/_routes/villa-type";

/* 🌐 Faz 6 Dalga 2 — tek, dile duyarlı route modülü (app/(public)/_routes/villa-type.tsx).
   Dil slug'ı → teknik anahtar ve kanonik 308 dispatcher'da; URL'ler route kaydından. */
const route = localeRouteFor("villaType", villaTypeRouteModule);

export const generateMetadata = route.generateMetadata;
export default route.Page;
