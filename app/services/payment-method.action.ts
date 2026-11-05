"use server";

import { requirePermission } from "@/lib/auth/action-authz";
import {
  getPaymentMethods,
  deletePaymentMethod,
  type PaymentMethodInsert,
} from "@/app/services/payment-method.service";
import { localizeAdminRows } from "@/app/(admin)/maki-admin/_content/simple-content.server";
import {
  adminCreateContent,
  getAdminLocaleLayout,
} from "@/lib/i18n/content/content-admin.server";
import { PAYMENT_METHOD_TR_NAME_REQUIRED } from "@/lib/i18n/content/payment-method-tr";

/* ===============================================================
   🛡️ PAYMENT METHOD — SERVER ACTIONS
   ===============================================================
   🌐 Faz 5 — simetrik çoklu dil: ödeme yöntemi ADI merkezi içerik
   servisinden okunur/yazılır. Liste ANA DİLİN değerini gösterir; yeni
   kayıt ana dilde oluşturulur (tek transaction). Diğer diller "Çeviriler"
   panelinden. Eski yazma yolu (payment_methods.name'e doğrudan INSERT)
   bu modül için KAPALI. Silme değişmedi. throw-style davranış AYNEN
   (hata → throw).
   ⚠️ Voucher/e-posta TR okumaya devam eder (karar 7). Faz 5 dalga 2 —
   ÖDEME YÖNTEMİNE ÖZEL kontrol: ana dil TR değilken yeni yöntem için
   Türkçe ad (`name_tr`) ZORUNLU ve aynı transaction'da TR satırına yazılır
   → voucher/e-posta "Ödeme Yöntemi" satırı boş kalmaz. Genel mimaride TR
   zorunlu DEĞİL; yalnız bu modül.
   =============================================================== */

type PaymentMethodList = Awaited<ReturnType<typeof getPaymentMethods>>;

export async function getPaymentMethodsAction(): Promise<PaymentMethodList> {
  await requirePermission("payment_methods");
  return (await localizeAdminRows("payment_method", await getPaymentMethods(), ["name"])) as PaymentMethodList;
}

export async function createPaymentMethodAction(
  payload: PaymentMethodInsert & { name_tr?: string | null }
): Promise<void> {
  const caller = await requirePermission("payment_methods");
  const { name, name_tr, ...rest } = payload ?? ({} as PaymentMethodInsert & { name_tr?: string | null });
  const value = (name ?? "").toString();
  if (!value.trim()) throw new Error("İsim gerekli");
  const layout = await getAdminLocaleLayout();
  const trName = (name_tr ?? "").toString();
  if (layout.root !== "tr" && !trName.trim()) throw new Error(PAYMENT_METHOD_TR_NAME_REQUIRED);
  const technical: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rest)) {
    if (k === "id" || k === "created_at" || k === "updated_at" || v === undefined) continue;
    technical[k] = v;
  }
  const locales = [
    { locale: layout.root, patch: { name: value } },
    ...(layout.root !== "tr" ? [{ locale: "tr" as const, patch: { name: trName } }] : []),
  ];
  const r = await adminCreateContent(caller, {
    entity: "payment_method",
    technical,
    locales,
    title: value,
    route: "/maki-admin/payment-methods",
  });
  if (!r.ok) throw new Error(r.error);
}

export async function deletePaymentMethodAction(
  ...args: Parameters<typeof deletePaymentMethod>
): ReturnType<typeof deletePaymentMethod> {
  await requirePermission("payment_methods");
  return deletePaymentMethod(...args);
}
