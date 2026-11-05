import { localeRouteFor } from "@/lib/i18n/routing/locale-route";
import { regionRouteModule } from "@/app/(public)/_routes/region";

/* 🌐 Faz 6 Dalga 2 — tek, dile duyarlı route modülü (app/(public)/_routes/region.tsx).
   Bölge slug'ı çevrilmez (özel isim); dil kontrolü dispatcher'da; URL'ler route kaydından. */
const route = localeRouteFor("region", regionRouteModule);

export const generateMetadata = route.generateMetadata;
export default route.Page;
