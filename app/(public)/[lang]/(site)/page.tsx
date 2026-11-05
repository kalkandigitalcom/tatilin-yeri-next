import { localeRouteFor } from "@/lib/i18n/routing/locale-route";
import { homeRouteModule } from "@/app/(public)/_routes/home";

/* 🌐 Faz 6 Dalga 4 — tek, dile duyarlı route modülü (app/(public)/_routes/home.tsx).
   Dil kontrolü dispatcher'da (pasif dil → 404); URL'ler route kaydından. */
const route = localeRouteFor("home", homeRouteModule);

export const generateMetadata = route.generateMetadata;
export default route.Page;
