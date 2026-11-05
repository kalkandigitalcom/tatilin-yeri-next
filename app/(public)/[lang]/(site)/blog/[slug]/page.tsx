import { localeRouteFor } from "@/lib/i18n/routing/locale-route";
import { blogPostRouteModule } from "@/app/(public)/_routes/blog";

/* 🌐 Faz 6 Dalga 3 — tek, dile duyarlı route modülü (app/(public)/_routes/blog.tsx).
   Dil slug'ı → teknik anahtar ve kanonik 308 dispatcher'da; URL'ler route kaydından.
   Segment ayarı ESKİSİYLE AYNI (yayın durumu anında yansısın). */
export const dynamic = "force-dynamic";

const route = localeRouteFor("blogPost", blogPostRouteModule);

export const generateMetadata = route.generateMetadata;
export default route.Page;
