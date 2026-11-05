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
   🌐 Faz 5 — Kural çevirileri (ana dil DIŞINDAKİ diller)
   ===============================================================
   Okuma: requirePermission("rules"). Yazma: authorizeAdminSession +
   callerHasPermission (eski desen) → merkezi saveContent + denetim
   kaydı. Eski çeviri servisi yazması bu modül için KAPALI.
   =============================================================== */

export type RuleTranslationInput = { ruleId: string; locale: Locale; title: string };

export async function loadRuleTranslationsAction(
  ruleId: string
): Promise<LocaleTranslationsLoadResult> {
  await requirePermission("rules");
  return loadTranslationRows("rule_item", ruleId, ["title"]);
}

export async function saveRuleTranslationAction(
  input: RuleTranslationInput
): Promise<LocaleTranslationsSaveResult> {
  const auth = await authorizeAdminSession();
  if (!auth.ok) return { ok: false, error: "Yetkisiz" };
  if (!(await callerHasPermission(auth.caller.id, "rules"))) {
    return { ok: false, error: "Yetkisiz" };
  }
  const title = (input?.title ?? "").toString();
  if (!title.trim()) return { ok: false, error: "Başlık gerekli" };
  return saveTranslationRow(auth.caller, "rule_item", input.ruleId, input.locale, { title }, {
    route: "/maki-admin/rules",
  });
}
