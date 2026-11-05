"use server";

import {
  callerHasPermission,
  requirePermission,
} from "@/lib/auth/action-authz";
import { authorizeAdminSession } from "@/lib/admin-route-auth";
import type { Locale } from "@/lib/i18n/config";
import { PAYMENT_METHOD_TR_NAME_REQUIRED } from "@/lib/i18n/content/payment-method-tr";
import type {
  LocaleTranslationsLoadResult,
  LocaleTranslationsSaveResult,
} from "@/app/components/admin/shared/LocaleTranslationsPanel";
import {
  loadTranslationRows,
  saveTranslationRow,
} from "@/app/(admin)/maki-admin/_content/simple-content.server";

/* ===============================================================
   🌐 Faz 5 — Ödeme yöntemi çevirileri (ana dil DIŞINDAKİ diller)
   ===============================================================
   Okuma: requirePermission("payment_methods"). Yazma: authorizeAdminSession +
   callerHasPermission (eski desen) → merkezi saveContent + denetim
   kaydı. Eski çeviri servisi yazması bu modül için KAPALI.
   =============================================================== */

export type PaymentMethodTranslationInput = { paymentMethodId: string; locale: Locale; name: string };

export async function loadPaymentMethodTranslationsAction(
  paymentMethodId: string
): Promise<LocaleTranslationsLoadResult> {
  await requirePermission("payment_methods");
  return loadTranslationRows("payment_method", paymentMethodId, ["name"]);
}

export async function savePaymentMethodTranslationAction(
  input: PaymentMethodTranslationInput
): Promise<LocaleTranslationsSaveResult> {
  const auth = await authorizeAdminSession();
  if (!auth.ok) return { ok: false, error: "Yetkisiz" };
  if (!(await callerHasPermission(auth.caller.id, "payment_methods"))) {
    return { ok: false, error: "Yetkisiz" };
  }
  const name = (input?.name ?? "").toString();
  /* 🌐 Faz 5 dalga 2 — ödeme yöntemine özel: TR adı (voucher/e-posta)
     boşaltılamaz. Yalnız bu modül; genel mimaride TR zorunlu değil. */
  if (input?.locale === "tr" && !name.trim()) {
    return { ok: false, error: PAYMENT_METHOD_TR_NAME_REQUIRED };
  }
  return saveTranslationRow(auth.caller, "payment_method", input.paymentMethodId, input.locale, { name }, {
    route: "/maki-admin/payment-methods",
  });
}
