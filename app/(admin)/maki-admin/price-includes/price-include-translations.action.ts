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
   🌐 Faz 5 — Fiyata dahil çevirileri (ana dil DIŞINDAKİ diller)
   ===============================================================
   Okuma: requirePermission("price_includes"). Yazma: authorizeAdminSession +
   callerHasPermission (eski desen) → merkezi saveContent + denetim
   kaydı. Eski çeviri servisi yazması bu modül için KAPALI.
   =============================================================== */

export type PriceIncludeTranslationInput = { includeId: string; locale: Locale; title: string };

export async function loadPriceIncludeTranslationsAction(
  includeId: string
): Promise<LocaleTranslationsLoadResult> {
  await requirePermission("price_includes");
  return loadTranslationRows("price_include_item", includeId, ["title"]);
}

export async function savePriceIncludeTranslationAction(
  input: PriceIncludeTranslationInput
): Promise<LocaleTranslationsSaveResult> {
  const auth = await authorizeAdminSession();
  if (!auth.ok) return { ok: false, error: "Yetkisiz" };
  if (!(await callerHasPermission(auth.caller.id, "price_includes"))) {
    return { ok: false, error: "Yetkisiz" };
  }
  const title = (input?.title ?? "").toString();
  if (!title.trim()) return { ok: false, error: "Başlık gerekli" };
  return saveTranslationRow(auth.caller, "price_include_item", input.includeId, input.locale, { title }, {
    route: "/maki-admin/price-includes",
  });
}
