import { localeRoute } from "@/lib/i18n/routing/locale-route";
import * as tr from "@/app/(public)/kisa-sureli-tarihler/[ay]/[gece]/locale-page";
import * as en from "@/app/(public)/en/kisa-sureli-tarihler/[ay]/[gece]/locale-page";
import * as de from "@/app/(public)/de/kisa-sureli-tarihler/[ay]/[gece]/locale-page";

/* 🌐 Faz 2 — dil dispatcher'ı (route anahtarı: "shortGaps").
   Public URL'ler dile göre değişir (lib/i18n/routing/route-registry.ts);
   proxy bu iç yola rewrite eder. Sayfa içeriği her dilin MEVCUT
   modülündedir (locale-page.tsx) ve değiştirilmeden render edilir. */
export const dynamic = "force-dynamic";

const route = localeRoute("shortGaps", { tr, en, de });

export const generateMetadata = route.generateMetadata;
export default route.Page;
