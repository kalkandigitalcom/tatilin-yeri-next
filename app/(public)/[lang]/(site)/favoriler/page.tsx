import { localeRouteFor } from "@/lib/i18n/routing/locale-route";
import { favoritesRouteModule } from "@/app/(public)/_routes/favorites";

/* 🌐 Faz 6 Dalga 1 — tek, dile duyarlı route modülü (app/(public)/_routes/favorites.tsx).
   Dil, slug ve kanonik kontrolü dispatcher'da; URL'ler route kaydından. */
const route = localeRouteFor("favorites", favoritesRouteModule);

export const generateMetadata = route.generateMetadata;
export default route.Page;
