import { localeRoute } from "@/lib/i18n/routing/locale-route";
import * as tr from "@/app/(public)/rezervasyon/[slug]/locale-page";
import * as en from "@/app/(public)/en/rezervasyon/[slug]/locale-page";
import * as de from "@/app/(public)/de/rezervasyon/[slug]/locale-page";

/* 🌐 Faz 2 — dil dispatcher'ı (route anahtarı: "reservation").
   Public URL'ler dile göre değişir (lib/i18n/routing/route-registry.ts);
   proxy bu iç yola rewrite eder. Sayfa içeriği her dilin MEVCUT
   modülündedir (locale-page.tsx) ve değiştirilmeden render edilir. */
const route = localeRoute("reservation", { tr, en, de });

export const generateMetadata = route.generateMetadata;
export default route.Page;
