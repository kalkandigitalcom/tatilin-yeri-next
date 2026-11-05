"use server";

import {
  callerHasPermission,
  requirePermission,
} from "@/lib/auth/action-authz";
import { authorizeAdminSession } from "@/lib/admin-route-auth";
import type { Locale } from "@/lib/i18n/config";
import type {
  LocaleTranslationsLoadResult,
  LocaleTranslationsSaveResult,
} from "@/app/components/admin/shared/LocaleTranslationsPanel";
import {
  loadTranslationRows,
  saveTranslationRow,
} from "@/app/(admin)/maki-admin/_content/simple-content.server";

/* ===============================================================
   🌐 Faz 5 — Olanak çevirileri (ana dil DIŞINDAKİ diller)
   ===============================================================
   Okuma: requirePermission("features"). Yazma: authorizeAdminSession +
   callerHasPermission (eski desen) → merkezi saveContent + denetim
   kaydı. Eski app/services/villa-feature-translation.service.ts yazması
   bu modül için KAPALI.
   =============================================================== */

export type FeatureTranslationInput = { featureId: string; locale: Locale; name: string };

export async function loadFeatureTranslationsAction(
  featureId: string
): Promise<LocaleTranslationsLoadResult> {
  await requirePermission("features");
  return loadTranslationRows("villa_feature", featureId, ["name"]);
}

export async function saveFeatureTranslationAction(
  input: FeatureTranslationInput
): Promise<LocaleTranslationsSaveResult> {
  const auth = await authorizeAdminSession();
  if (!auth.ok) return { ok: false, error: "Yetkisiz" };
  if (!(await callerHasPermission(auth.caller.id, "features"))) {
    return { ok: false, error: "Yetkisiz" };
  }
  const name = (input?.name ?? "").toString();
  if (!name.trim()) return { ok: false, error: "İsim gerekli" };
  return saveTranslationRow(auth.caller, "villa_feature", input.featureId, input.locale, { name }, {
    route: "/maki-admin/features",
  });
}
