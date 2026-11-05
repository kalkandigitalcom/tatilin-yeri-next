import { localeRouteFor } from "@/lib/i18n/routing/locale-route";
import { blogIndexRouteModule } from "@/app/(public)/_routes/blog";

/* 🌐 Faz 6 Dalga 3 — tek, dile duyarlı route modülü (app/(public)/_routes/blog.tsx).
   Dil kontrolü dispatcher'da; URL'ler route kaydından. */
const route = localeRouteFor("blog", blogIndexRouteModule);

export const generateMetadata = route.generateMetadata;
export default route.Page;
