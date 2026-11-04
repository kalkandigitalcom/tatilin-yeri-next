"use server";

import { revalidateLocaleSlugs } from "@/lib/i18n/routing/slug-map.server";

import {
  callerHasPermission,
  requirePermission,
} from "@/lib/auth/action-authz";
import {
  getTypeTranslations,
  upsertTypeTranslation,
  type TypeTranslationInput,
  type TypeTranslationsListResult,
  type TypeTranslationResult,
} from "@/app/services/villa-type-translation.service";
import { authorizeAdminSession } from "@/lib/admin-route-auth";

/* ===============================================================
   🛡️ PHASE 10D — Batch 3 — Admin Villa Type Translation UI Server Actions
   ===============================================================
   `feature-translations.action.ts` (Batch 2) / `villa-translations.action.ts`
   (Phase 10A) ile BİREBİR AYNI desen.

   Okuma: sayfa zaten middleware ile korunuyor — ekstra auth GEREKMİYOR.
   Yazma: `authorizeAdminSession()` İLK kontrol — yetkisiz çağrıda
   servis/DB'ye HİÇ ulaşılmaz.

   ⚠️ Bu dosya yalnız ince wrapper — iş mantığı YOK. Batch 1'de yazılan
   `app/services/villa-type-translation.service.ts` DEĞİŞTİRİLMEDİ,
   yalnız delege edilir. Mevcut `types.action.ts`'deki CRUD/cover/sort
   action'larına DOKUNULMADI.
   =============================================================== */

export async function loadTypeTranslationsAction(
  typeId: string
): Promise<TypeTranslationsListResult> {
  await requirePermission("villa_types");
  return getTypeTranslations(typeId);
}

export async function saveTypeTranslationAction(
  input: TypeTranslationInput
): Promise<TypeTranslationResult> {
  const auth = await authorizeAdminSession();
  if (!auth.ok) return { ok: false, error: "Yetkisiz" };
  if (!(await callerHasPermission(auth.caller.id, "villa_types"))) {
    return { ok: false, error: "Yetkisiz" };
  }

  const result = await upsertTypeTranslation(input);
  /* 🌐 Faz 2 — dil slug'ı değiştiyse URL haritası + sayfalar yenilenir. */
  if (result.ok && input.slug !== undefined) revalidateLocaleSlugs();
  return result;
}
