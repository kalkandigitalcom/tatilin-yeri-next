"use server";

import { revalidateTag } from "next/cache";

import { callerHasPermission, requirePermission } from "@/lib/auth/action-authz";
import { authorizeAdminSession } from "@/lib/admin-route-auth";
import {
  getSitePopupForAdminCentral,
  saveSitePopupCentral,
  type SitePopupAdminValuesV2,
} from "./popup-content.server";
import { SITE_POPUP_CACHE_TAG } from "@/lib/site-popup.cache";

/* ===============================================================
   🛡️ ADMIN > AYARLAR > AÇILIŞ POPUP — server actions
   ===============================================================
   settings-translations.action.ts ile AYNI desen:
     • Okuma: requirePermission("settings") — yetkisizse THROW.
     • Yazma: authorizeAdminSession + callerHasPermission("settings")
       İLK kontrol; yetkisiz çağrı servise/DB'ye HİÇ ulaşmaz.
   Başarılı yazmadan sonra YALNIZ "site-popup" tag'i invalidate edilir
   (settings/menu/villa cache'leri etkilenmez).
   =============================================================== */

/* 🌐 Faz 5 dalga 2 — popup metinleri merkezi içerik servisinden (ana form =
   ana dil, diğer iki dil sekmelerde). Eski saveSitePopup yolu KAPALI. */
export async function loadSitePopupAction(): Promise<SitePopupAdminValuesV2 | null> {
  await requirePermission("settings");
  return getSitePopupForAdminCentral();
}

export async function saveSitePopupAction(
  input: unknown
): Promise<{ ok: true; values: SitePopupAdminValuesV2 } | { ok: false; error: string }> {
  const auth = await authorizeAdminSession();
  if (!auth.ok) return { ok: false, error: "Yetkisiz" };
  if (!(await callerHasPermission(auth.caller.id, "settings"))) {
    return { ok: false, error: "Yetkisiz" };
  }
  const result = await saveSitePopupCentral(auth.caller, input);
  if (result.ok) {
    revalidateTag(SITE_POPUP_CACHE_TAG, { expire: 0 });
  }
  return result;
}
