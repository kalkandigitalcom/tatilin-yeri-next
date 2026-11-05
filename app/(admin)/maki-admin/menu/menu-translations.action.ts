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
   🌐 Faz 5 — Menü adı çevirileri (ana dil DIŞINDAKİ diller)
   ===============================================================
   Okuma: requirePermission("menu"). Yazma: authorizeAdminSession +
   callerHasPermission (eski desen) → merkezi saveContent + denetim
   kaydı. Eski çeviri servisi yazması bu modül için KAPALI.
   =============================================================== */

export type MenuTranslationInput = { menuId: string; locale: Locale; name: string };

export async function loadMenuTranslationsAction(
  menuId: string
): Promise<LocaleTranslationsLoadResult> {
  await requirePermission("menu");
  return loadTranslationRows("menu", menuId, ["name"]);
}

export async function saveMenuTranslationAction(
  input: MenuTranslationInput
): Promise<LocaleTranslationsSaveResult> {
  const auth = await authorizeAdminSession();
  if (!auth.ok) return { ok: false, error: "Yetkisiz" };
  if (!(await callerHasPermission(auth.caller.id, "menu"))) {
    return { ok: false, error: "Yetkisiz" };
  }
  const name = (input?.name ?? "").toString();
  return saveTranslationRow(auth.caller, "menu", input.menuId, input.locale, { name }, {
    route: "/maki-admin/menu",
  });
}
