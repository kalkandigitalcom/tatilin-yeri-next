"use client";

/* ===============================================================
   🌐 Faz 5 — Ödeme yöntemi (payment_methods) çeviri paneli
   ===============================================================
   Ortak LocaleTranslationsPanel: referans = ANA DİL (liste satırında
   düzenlenir), sekmeler = diğer iki dil. Ana dil TR iken görünüm eskisiyle
   aynıdır (TR referans, EN/DE sekmeleri).
   =============================================================== */

import LocaleTranslationsPanel from "@/app/components/admin/shared/LocaleTranslationsPanel";
import {
  loadPaymentMethodTranslationsAction,
  savePaymentMethodTranslationAction,
} from "./payment-method-translations.action";

type Props = {
  paymentMethodId: string;
  /** Ana dil referans metni — bu panelden DÜZENLENEMEZ. */
  paymentMethodName: string;
};

export default function PaymentMethodTranslationsPanel({ paymentMethodId, paymentMethodName }: Props) {
  return (
    <LocaleTranslationsPanel
      recordId={paymentMethodId}
      referenceValue={paymentMethodName}
      field="name"
      requiredMessage="İsim gerekli"
      allowEmpty
      toastPrefix="payment-method"
      maxLength={200}
      load={loadPaymentMethodTranslationsAction}
      save={(locale, name) => savePaymentMethodTranslationAction({ paymentMethodId, locale, name })}
    />
  );
}
