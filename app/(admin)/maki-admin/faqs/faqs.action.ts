"use server";

import { requirePermission } from "@/lib/auth/action-authz";
import {
  getFaqsForAdmin as getFaqsForAdminService,
  type Faq,
  type FaqInput,
} from "@/app/services/faq.service";
import { localizeAdminRows } from "@/app/(admin)/maki-admin/_content/simple-content.server";
import { replaceFaqsCentral } from "./faq-content.server";

/* ===============================================================
   🛡️ FAQ — SERVER ACTIONS (thin wrapper)
   ===============================================================
   Admin `faqs/page.tsx` (client) → bu server action'lar →
   `faq.service` (server) → native repo.

   ⚠️ İNCE WRAPPER: iş mantığı YOK — yalnız service'i delege eder. İmzalar +
     dönüş tipleri service ile BİREBİR (davranış değişmez); amaç yalnız
     client→server sınırını oluşturup native repo'yu client bundle'a
     sızdırmamak.
   =============================================================== */

/* 🌐 Faz 5 — soru/cevap ANA DİLİN değeriyle (merkezi içerik). */
export async function getFaqsForAdminAction(): Promise<Faq[]> {
  await requirePermission("faqs");
  return localizeAdminRows("faq", await getFaqsForAdminService(), ["question", "answer"]);
}

export async function replaceFaqsAction(
  items: FaqInput[]
): Promise<{ ok: boolean; error?: string; ids?: string[] }> {
  const caller = await requirePermission("faqs");
  /* 🌐 Faz 5 — soru/cevap merkezi içerik servisiyle ANA DİLDE yazılır
     (faq-content.server.ts); eski faqs.question/answer doğrudan yazma
     yolu KAPALI. */
  /* 🛡️ Dönüş tipine `ids` EKLENDİ (additive): kaydedilen satırların
     id'leri payload SIRASINDA döner; admin ekranı EN/DE çevirilerini
     bu id'lerle `faq_translations`'a yazar. Mevcut `{ ok, error }`
     sözleşmesi DEĞİŞMEDİ. */
  return replaceFaqsCentral(caller, items);
}
