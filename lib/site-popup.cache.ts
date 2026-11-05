import "server-only";

import { unstable_cache } from "next/cache";

import { getPublicSitePopup } from "@/app/services/site-popup.service";
import { contentCacheTags } from "@/lib/i18n/content/content-cache-policy";
import type { PopupLocaleCtx } from "@/lib/site-popup";

/* ===============================================================
   🛡️ SITE POPUP — public cache (tag: "site-popup")
   ===============================================================
   Public layout her render'da bunu çağırır; DB'ye en fazla saatte
   bir gidilir. Admin kaydı `revalidateTag("site-popup")` ile anında
   invalidate eder (bkz. popup.action.ts). Diğer cache'lerden
   (settings/menu/…) BAĞIMSIZ — popup değişikliği onları temizlemez.
   Tarih penceresi client'ta da kontrol edildiği için cache'in en
   fazla 1 saatlik gecikmesi başlangıç/bitiş anını kaydırmaz.
   =============================================================== */
export const SITE_POPUP_CACHE_TAG = "site-popup";

export const getCachedSitePopup = unstable_cache(
  async () => getPublicSitePopup(),
  ["site-popup:public"],
  { tags: [SITE_POPUP_CACHE_TAG], revalidate: 3600 }
);

/* 🌐 Faz 6 Dalga 4 — merkezi tekil kayıt kuralı. Dil bağlamı (ana dil +
   aktif diller) cache ANAHTARININ parçasıdır (argümanlar) → dil ayarı
   değişince eski bağlamın sonucu servis edilmez. Tag'ler aynı + merkezi
   içerik tag'leri (site_popup yazımı cache'i düşürür). */
const getCachedSitePopupForCtx = unstable_cache(
  async (root: PopupLocaleCtx["root"], enabledCsv: string) =>
    getPublicSitePopup({ root, enabled: enabledCsv.split(",").filter(Boolean) as PopupLocaleCtx["enabled"] }),
  ["site-popup:public:locale-ctx:v1"],
  { tags: [SITE_POPUP_CACHE_TAG, ...contentCacheTags("site_popup")], revalidate: 3600 }
);

export function getCachedSitePopupLocalized(ctx: PopupLocaleCtx) {
  return getCachedSitePopupForCtx(ctx.root, ctx.enabled.join(","));
}
