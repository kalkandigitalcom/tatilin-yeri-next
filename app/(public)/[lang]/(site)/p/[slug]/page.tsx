import { localeRouteFor } from "@/lib/i18n/routing/locale-route";
import { cmsPageRouteModule } from "@/app/(public)/_routes/cms-page";

/* 🌐 Faz 6 Dalga 3 — tek, dile duyarlı route modülü (app/(public)/_routes/cms-page.tsx).
   Dil slug'ı → teknik anahtar ve kanonik 308 dispatcher'da; URL'ler route kaydından. */
const route = localeRouteFor("page", cmsPageRouteModule);

export const generateMetadata = route.generateMetadata;
export default route.Page;
