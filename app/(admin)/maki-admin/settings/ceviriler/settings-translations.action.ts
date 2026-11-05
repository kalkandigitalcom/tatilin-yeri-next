"use server";

import {
  callerHasPermission,
  requirePermission,
} from "@/lib/auth/action-authz";
import {
  deleteSettingsTranslation,
  getSettingsTranslations,
  upsertSettingsTranslation,
  type SettingsTranslationInput,
  type SettingsTranslationsLoadResult,
} from "@/app/services/settings-translation.service";
import { revalidateSettings } from "@/app/services/revalidate.actions";
import { authorizeAdminSession } from "@/lib/admin-route-auth";
import type { Locale } from "@/lib/i18n/config";
import type { SettingsTranslationValues } from "@/lib/i18n/settings-translations.types";
import { isContentWriteMigrated } from "@/lib/i18n/content/content-write-modules";
import {
  clearSettingsTranslationCentral,
  saveSettingsTranslationCentral,
} from "../_content/settings-content.server";

/* 🌐 Faz 5 dalga 2 — "settings" merkezi yazmaya geçtiğinde kayıt/silme
   `saveTranslationRow` (yalnız ana dil DIŞINDAKİ diller) üzerinden
   yapılır; eski settings-translation.service yazma yolu KAPALIDIR.
   Ana dil (public_default_locale) bu ekrandan düzenlenmez. */

/* ===============================================================
   🛡️ PHASE 10L §4 — ADMIN SETTINGS TRANSLATION SERVER ACTIONS
   ===============================================================
   `app/(admin)/maki-admin/types/type-translations.action.ts` (Phase 10D)
   ile BİREBİR AYNI desen:
     • Okuma: sayfa zaten middleware ile korunuyor — ekstra auth YOK.
     • Yazma: `authorizeAdminSession()` İLK kontrol — yetkisiz çağrıda
       servise/DB'ye HİÇ ULAŞILMAZ.
     • Bu dosya ince wrapper; iş mantığı `app/services/
       settings-translation.service.ts`'te.

   ⚠️ MEVCUT SETTINGS SAVE AKIŞINA DOKUNULMADI (§4/§14):
     `/api/admin/settings` PUT, `settings.client.ts > updateSettingsClient`
     ve 7 settings alt sayfasının handleSubmit'i DEĞİŞMEDİ. Çeviri
     payload'ı O AKIŞA HİÇ GİRMEZ — ayrı tabloya, ayrı action ile yazılır.

   ⚠️ CACHE (§11): Başarılı yazmadan sonra `revalidateSettings()` —
     mevcut `"settings"` tag'i, YENİ bir cache sistemi/tag EKLENMEDİ.
     Public taraf çevirileri `getPublicSettings()` payload'ı üzerinden
     okuduğu için bu tek invalidate yeterlidir.
   =============================================================== */

export async function loadSettingsTranslationsAction(): Promise<SettingsTranslationsLoadResult> {
  await requirePermission("settings");
  return getSettingsTranslations();
}

/** Faz 5: locale artık ana dil DIŞINDAKİ herhangi bir dil olabilir
 *  (ana dil EN ise TR de bir çeviri dilidir). */
export type SettingsTranslationActionResult =
  | { ok: true; locale: Locale; values: SettingsTranslationValues }
  | { ok: false; error: string };

export async function saveSettingsTranslation(
  input: Omit<SettingsTranslationInput, "locale"> & { locale: string }
): Promise<SettingsTranslationActionResult> {
  const auth = await authorizeAdminSession();
  if (!auth.ok) return { ok: false, error: "Yetkisiz" };
  if (!(await callerHasPermission(auth.caller.id, "settings"))) {
    return { ok: false, error: "Yetkisiz" };
  }

  if (isContentWriteMigrated("settings")) {
    const r = await saveSettingsTranslationCentral(auth.caller, input as { locale: string } & Record<string, unknown>);
    if (r.ok) await revalidateSettings();
    return r;
  }

  const result = await upsertSettingsTranslation(input as SettingsTranslationInput);

  /* Yalnız GERÇEKTEN yazıldıysa invalidate — başarısız denemede public
     cache boşuna temizlenmez. */
  if (result.ok) {
    await revalidateSettings();
  }

  return result;
}

export async function deleteSettingsTranslationAction(
  locale: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await authorizeAdminSession();
  if (!auth.ok) return { ok: false, error: "Yetkisiz" };
  if (!(await callerHasPermission(auth.caller.id, "settings"))) {
    return { ok: false, error: "Yetkisiz" };
  }

  if (isContentWriteMigrated("settings")) {
    const r = await clearSettingsTranslationCentral(auth.caller, locale);
    if (r.ok) await revalidateSettings();
    return r;
  }

  const result = await deleteSettingsTranslation(locale);
  if (result.ok) {
    await revalidateSettings();
  }

  return result;
}
