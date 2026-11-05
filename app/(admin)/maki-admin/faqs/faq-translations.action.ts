"use server";

import {
  callerHasPermission,
  requirePermission,
} from "@/lib/auth/action-authz";
import { authorizeAdminSession } from "@/lib/admin-route-auth";
import type { Locale } from "@/lib/i18n/config";
import type { AdminLocaleLayout } from "@/lib/i18n/content/content-admin";
import {
  getAdminContentRows,
  getAdminLocaleLayout,
} from "@/lib/i18n/content/content-admin.server";
import { saveTranslationRow } from "@/app/(admin)/maki-admin/_content/simple-content.server";

/* ===============================================================
   🌐 Faz 5 — SSS çevirileri (ana dil DIŞINDAKİ diller)
   ===============================================================
   Okuma: requirePermission("faqs") — TEK batch okuma (kayıt başına sorgu
   yok). Yazma: authorizeAdminSession + callerHasPermission → merkezi
   saveContent + denetim kaydı. Boş alan "" olarak yazılır (bilerek
   boşaltma → okuma tarafında ana dile düşer). Eski
   faq-translation.service yazması KAPALI.
   =============================================================== */

export type FaqTranslationFields = { question: string; answer: string };
export type FaqTranslationInput = { faqId: string; locale: Locale; question: string; answer: string };
export type FaqTranslationsMapResult =
  | { ok: true; map: Record<string, Partial<Record<Locale, FaqTranslationFields>>>; layout?: AdminLocaleLayout }
  | { ok: false; error: string };

export async function loadFaqTranslationsAction(faqIds: string[]): Promise<FaqTranslationsMapResult> {
  await requirePermission("faqs");
  try {
    const layout = await getAdminLocaleLayout();
    const ids = Array.from(new Set((faqIds || []).filter((id) => typeof id === "string" && id.trim())));
    const rows = await getAdminContentRows("faq", ids);
    const map: Record<string, Partial<Record<Locale, FaqTranslationFields>>> = {};
    for (const [id, byLocale] of rows) {
      for (const l of layout.translations) {
        const v = byLocale[l];
        if (!v) continue;
        (map[id] ??= {})[l] = {
          question: typeof v.question === "string" ? v.question : "",
          answer: typeof v.answer === "string" ? v.answer : "",
        };
      }
    }
    return { ok: true, map, layout };
  } catch {
    return { ok: false, error: "Çeviriler okunamadı" };
  }
}

export async function saveFaqTranslationAction(
  input: FaqTranslationInput
): Promise<{ ok: true; row: Record<string, unknown> } | { ok: false; error: string }> {
  const auth = await authorizeAdminSession();
  if (!auth.ok) return { ok: false, error: "Yetkisiz" };
  if (!(await callerHasPermission(auth.caller.id, "faqs"))) {
    return { ok: false, error: "Yetkisiz" };
  }
  return saveTranslationRow(
    auth.caller,
    "faq",
    input.faqId,
    input.locale,
    { question: (input.question ?? "").toString().trim(), answer: (input.answer ?? "").toString().trim() },
    { route: "/maki-admin/faqs" }
  );
}
