import { localeRoute } from "@/lib/i18n/routing/locale-route";
import * as tr from "@/app/(public)/blog/locale-page";
import * as en from "@/app/(public)/en/blog/locale-page";
import * as de from "@/app/(public)/de/blog/locale-page";

/* 🌐 Faz 2 — dil dispatcher'ı (route anahtarı: "blog").
   Public URL'ler dile göre değişir (lib/i18n/routing/route-registry.ts);
   proxy bu iç yola rewrite eder. Sayfa içeriği her dilin MEVCUT
   modülündedir (locale-page.tsx) ve değiştirilmeden render edilir. */
const route = localeRoute("blog", { tr, en, de });

export const generateMetadata = route.generateMetadata;
export default route.Page;
