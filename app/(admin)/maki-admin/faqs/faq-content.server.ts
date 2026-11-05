import "server-only";

import { getPgPool } from "@/lib/db/pg.client";
import { faqRepository } from "@/lib/db/faq.repository";
import type { AuthorizedAdminCaller } from "@/lib/admin-route-auth";
import type { FaqInput } from "@/app/services/faq.service";
import {
  adminCreateContent,
  adminSaveContentMany,
  getAdminLocaleLayout,
} from "@/lib/i18n/content/content-admin.server";

/* ===============================================================
   🌐 Faz 5 — SSS kaydı (merkezi içerik servisi)
   ===============================================================
   Eski `replaceFaqs` ile AYNI sözleşme ve kurallar (trim, iki alan da dolu,
   en fazla 15, id'ler korunur, sıra = payload index, `ids` payload
   sırasında döner). Fark: soru/cevap ANA DİLDE merkezi servisle yazılır
   (mevcut satırlar TEK transaction'da; yeni satırlar ana kayıt + içerik
   birlikte). Teknik kolonlar (sort_order, is_active) doğrudan. Eski
   `faqs.question/answer` doğrudan yazma yolu KAPALI.
   =============================================================== */

const MAX_FAQS = 15;

export async function replaceFaqsCentral(
  caller: AuthorizedAdminCaller,
  items: FaqInput[]
): Promise<{ ok: boolean; error?: string; ids?: string[] }> {
  const clean = (items || [])
    .map((i) => ({
      id: (i?.id ?? "").toString().trim() || null,
      question: (i?.question ?? "").trim(),
      answer: (i?.answer ?? "").trim(),
    }))
    .filter((i) => i.question.length > 0 && i.answer.length > 0);
  if (clean.length > MAX_FAQS) {
    return { ok: false, error: `En fazla ${MAX_FAQS} SSS kaydedilebilir.` };
  }

  const { data: existingData, error: readErr } = await faqRepository.findAllForAdmin();
  if (readErr) return { ok: false, error: readErr.message };
  const existingIds = new Set(((existingData || []) as Array<{ id: string }>).map((r) => r.id));

  const keptIds = new Set(clean.map((c) => c.id).filter((id): id is string => !!id && existingIds.has(id)));
  const removedIds = [...existingIds].filter((id) => !keptIds.has(id));
  if (removedIds.length > 0) {
    const { error: delErr } = await faqRepository.deleteByIds(removedIds);
    if (delErr) return { ok: false, error: delErr.message };
  }

  const layout = await getAdminLocaleLayout();
  const existing = clean.map((c, idx) => ({ c, idx })).filter(({ c }) => !!c.id && existingIds.has(c.id));

  /* Teknik kolonlar (içerik DEĞİL). */
  for (const { c, idx } of existing) {
    await getPgPool().query("UPDATE public.faqs SET sort_order = $2, is_active = true WHERE id = $1::uuid", [c.id, idx]);
  }

  if (existing.length > 0) {
    const r = await adminSaveContentMany(caller, {
      entity: "faq",
      action: "content.update",
      route: "/maki-admin/faqs",
      title: "SSS",
      items: existing.map(({ c }) => ({
        entity: "faq" as const,
        parentId: c.id as string,
        locale: layout.root,
        patch: { question: c.question, answer: c.answer },
      })),
    });
    if (!r.ok) return { ok: false, error: r.error };
  }

  const ids = new Array<string>(clean.length).fill("");
  for (const { c, idx } of existing) ids[idx] = c.id as string;
  for (const [idx, c] of clean.entries()) {
    if (c.id && existingIds.has(c.id)) continue;
    const r = await adminCreateContent(caller, {
      entity: "faq",
      technical: { sort_order: idx, is_active: true },
      locales: [{ locale: layout.root, patch: { question: c.question, answer: c.answer } }],
      title: c.question,
      route: "/maki-admin/faqs",
    });
    if (!r.ok) return { ok: false, error: r.error };
    ids[idx] = r.id;
  }
  return { ok: true, ids };
}
