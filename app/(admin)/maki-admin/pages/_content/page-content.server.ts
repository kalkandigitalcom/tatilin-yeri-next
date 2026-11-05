import "server-only";

import type { AuthorizedAdminCaller } from "@/lib/admin-route-auth";
import type { Locale } from "@/lib/i18n/config";
import { isRealArrayColumn } from "@/lib/db/pg-array-columns";
import { pagesServerRepository } from "@/lib/db/pages.repository.server";
import { parsePageSections } from "@/lib/page-sections";
import {
  adminCreateContent,
  adminSaveContentMany,
  getAdminContent,
  getAdminLocaleLayout,
  getSlugSeparationCapability,
  getTechnicalKey,
} from "@/lib/i18n/content/content-admin.server";
import type { AdminLocaleLayout } from "@/lib/i18n/content/content-admin";
import {
  loadTranslationRows,
  localizeAdminRows,
  saveTranslationRow,
} from "@/app/(admin)/maki-admin/_content/simple-content.server";

/* ===============================================================
   🌐 CMS SAYFALARI — Faz 5 dalga 2 merkezi okuma/yazma
   ===============================================================
   Çevrilebilir (dil başına): title, body, excerpt, seo_title,
   seo_description, sections (jsonb) + dil URL slug'ı.
   Dilden bağımsız (ana tablo, teknik yama): cover_image, noindex,
   is_active, show_in_menu, menu_parent_id, menu_order …
   `pages.slug` TEKNİK ANAHTARDIR (yalnız oluşturmada yazılır).

   body / eski `content` sözleşmesi (Faz 5 1. dalga kararı):
     • ana formda gövde boşaltılırsa `""` yazılır → eski `pages.content`
       metni GERİ GELMEZ;
     • `null` = değer yok (yalnız o zaman eski `content` görünür);
     • `pages.content` kolonuna HİÇBİR yol yazmaz (eski `content`
       anahtarı yok sayılır).
   Çeviri kartında boş alan → `null` (ana dile düşer, eski davranış).
   Bölümler (sections): ana form düzenlemez (eski davranış — PATCH'e
   girmez); yeni sayfada ana dile, çeviri kartında o dile yazılır.
   =============================================================== */

export const PAGE_CONTENT_FIELDS = ["title", "body", "excerpt", "seo_title", "seo_description", "sections"] as const;
const CONTENT_SET = new Set<string>(PAGE_CONTENT_FIELDS);
/** Yazılmayan / ayrı yönetilen anahtarlar. */
const NEVER_TECHNICAL = new Set(["id", "slug", "content", "created_at", "updated_at"]);

const LIMITS = { title: 200, excerpt: 300, body: 20000, seo_title: 120, seo_description: 300 } as const;
const LABELS = { title: "Başlık", excerpt: "Kısa açıklama", body: "İçerik", seo_title: "SEO başlık", seo_description: "SEO açıklama" } as const;
const MAX_SECTIONS_JSON_LEN = 40000;

function normString(v: unknown): string | null | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

export type PageSaveResult =
  | { ok: true; id?: string; data?: Record<string, unknown> }
  | { ok: false; status: number; error: string };

function statusOf(code: string | undefined): number {
  if (code === "validation") return 400;
  if (code === "conflict" || code === "guard") return 409;
  if (code === "not-found") return 404;
  if (code === "busy") return 503;
  return 500;
}
function failure(r: { error: string; code?: string }, hasSlug: boolean): PageSaveResult {
  const code = r.code;
  return {
    ok: false,
    status: statusOf(code),
    error:
      code === "conflict"
        ? "Bu slug zaten kullanılıyor"
        : code === "guard" && hasSlug
          ? "Türkçe URL slug'ı teknik anahtardan ayrılmadan (migration 108) değiştirilemez"
          : r.error || "Kaydedilemedi",
  };
}

/** Gövde: boş → "" (bilinçli temizleme), null/undefined → "" yalnız
 *  anahtar gönderildiyse. */
function bodyValue(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** İçerik dışı jsonb değerler (obje / gerçek dizi kolonu olmayan dizi). */
function jsonColumnsOf(values: Record<string, unknown>): string[] {
  return Object.entries(values)
    .filter(([k, v]) =>
      v !== null && typeof v === "object" && !(v instanceof Date) && (!Array.isArray(v) || !isRealArrayColumn("pages", k))
    )
    .map(([k]) => k);
}

export async function createPageCentral(
  caller: AuthorizedAdminCaller,
  payload: Record<string, unknown>
): Promise<PageSaveResult> {
  const title = normString(payload.title);
  const handle = normString(payload.slug);
  if (!title || !handle) return { ok: false, status: 400, error: "Başlık ve slug zorunlu" };
  const layout = await getAdminLocaleLayout();
  const patch: Record<string, unknown> = {
    title,
    body: payload.body === undefined ? null : bodyValue(payload.body) || null,
    excerpt: normString(payload.excerpt) ?? null,
    seo_title: normString(payload.seo_title) ?? null,
    seo_description: normString(payload.seo_description) ?? null,
    sections: parsePageSections(payload.sections),
  };
  if (layout.root !== "tr") patch.slug = handle;
  const technical: Record<string, unknown> = { slug: handle };
  for (const [k, v] of Object.entries(payload)) {
    if (CONTENT_SET.has(k) || NEVER_TECHNICAL.has(k) || v === undefined) continue;
    technical[k] = v;
  }
  /* createContent: içerik DIŞI jsonb değerleri metin olarak (PG kolona göre çevirir). */
  for (const k of jsonColumnsOf(technical)) technical[k] = JSON.stringify(technical[k]);
  const r = await adminCreateContent(caller, {
    entity: "page",
    technical,
    locales: [{ locale: layout.root, patch }],
    title,
    route: "/maki-admin/pages",
  });
  if (!r.ok) return failure(r, true);
  const { data } = await pagesServerRepository.findById(r.id);
  return { ok: true, id: r.id, data: data ? await overlayPageRoot(data as Record<string, unknown>) : { id: r.id } };
}

export async function updatePageCentral(
  caller: AuthorizedAdminCaller,
  id: string,
  body: Record<string, unknown>
): Promise<PageSaveResult> {
  const layout = await getAdminLocaleLayout();
  const content: Record<string, unknown> = {};
  if (body.title !== undefined) {
    if (typeof body.title !== "string" || body.title.trim().length === 0) {
      return { ok: false, status: 400, error: "Başlık boş olamaz" };
    }
    content.title = body.title.trim();
  }
  if (body.body !== undefined) content.body = bodyValue(body.body);
  if (body.excerpt !== undefined) content.excerpt = normString(body.excerpt) ?? null;
  if (body.seo_title !== undefined) content.seo_title = normString(body.seo_title) ?? null;
  if (body.seo_description !== undefined) content.seo_description = normString(body.seo_description) ?? null;
  /* sections ana formdan YAZILMAZ (eski davranış). */

  if (typeof body.slug === "string") {
    const next = body.slug.trim() || null;
    const [all, technicalKey] = await Promise.all([getAdminContent("page", id), getTechnicalKey("page", id)]);
    const cur = (all[layout.root]?.slug as string | null | undefined) ?? null;
    if (next !== (cur ?? technicalKey) && !(next === null && cur === null)) content.slug = next;
  } else if (body.slug !== undefined) {
    return { ok: false, status: 400, error: "Slug boş olamaz" };
  }

  const technical: Record<string, unknown> = {};
  if (typeof body.noindex === "boolean") technical.noindex = body.noindex;
  if (typeof body.is_active === "boolean") technical.is_active = body.is_active;
  if (typeof body.show_in_menu === "boolean") technical.show_in_menu = body.show_in_menu;
  if (body.cover_image !== undefined) technical.cover_image = normString(body.cover_image) ?? null;

  if (Object.keys(content).length === 0 && Object.keys(technical).length === 0) {
    return { ok: false, status: 400, error: "Güncellenecek alan yok" };
  }
  const r = await adminSaveContentMany(caller, {
    entity: "page",
    entityId: id,
    action: "content.update",
    title: typeof content.title === "string" ? content.title : null,
    route: "/maki-admin/pages",
    items: Object.keys(content).length ? [{ entity: "page", parentId: id, locale: layout.root, patch: content }] : [],
    technical: Object.keys(technical).length ? [{ entity: "page", parentId: id, values: technical }] : [],
  });
  if (!r.ok) return failure(r, "slug" in content);
  const { data } = await pagesServerRepository.findById(id);
  return { ok: true, data: data ? await overlayPageRoot(data as Record<string, unknown>) : undefined };
}

/** GET [id] / yanıt: içerik ANA DİLİN değeri; `slug` = ana dil URL
 *  slug'ı (yoksa teknik anahtar); eski `content` yalnız ana dil TR iken
 *  (TR'nin ek yedeği — Faz 3.1). */
export async function overlayPageRoot(row: Record<string, unknown>): Promise<Record<string, unknown>> {
  const id = String(row.id ?? "");
  const layout = await getAdminLocaleLayout();
  const [all, slugSeparated] = await Promise.all([getAdminContent("page", id), getSlugSeparationCapability()]);
  const root = all[layout.root];
  const out: Record<string, unknown> = { ...row, technical_key: row.slug ?? null, root_locale: layout.root, slug_separated: slugSeparated };
  if (root || layout.root !== "tr") {
    for (const f of PAGE_CONTENT_FIELDS) out[f] = (root?.[f] as unknown) ?? (f === "title" ? "" : null);
    /* Bölüm YAPISI kaynağı (çeviri kartı): ana dilde bölüm yoksa ana tablo
       (TR aynası) bölümleri — okuma zincirindeki yedekle aynı. */
    if (!Array.isArray(root?.sections) || (root?.sections as unknown[]).length === 0) out.sections = row.sections ?? null;
    out.slug = (root?.slug as string | null | undefined) ?? row.slug ?? "";
  }
  if (layout.root !== "tr") out.content = null;
  return out;
}

export async function localizePageList<T extends { id: string }>(rows: readonly T[]) {
  return localizeAdminRows("page", rows, ["title"]);
}

/* ---------------- Çeviri kartı ---------------- */

export type PageTranslationCentralInput = {
  pageId: string;
  locale: string;
  title?: string | null;
  excerpt?: string | null;
  body?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  slug?: string | null;
  sections?: unknown;
};

export async function loadPageTranslationsCentral(
  pageId: string
): Promise<{ ok: true; rows: Array<{ locale: Locale } & Record<string, unknown>>; layout: AdminLocaleLayout; technicalKey: string | null; slugSeparated: boolean; rootSections: unknown } | { ok: false; error: string }> {
  const r = await loadTranslationRows("page", pageId, PAGE_CONTENT_FIELDS);
  if (!r.ok) return r;
  const [technicalKey, slugSeparated, all] = await Promise.all([
    getTechnicalKey("page", pageId),
    getSlugSeparationCapability(),
    getAdminContent("page", pageId),
  ]);
  return { ...r, technicalKey, slugSeparated, rootSections: all[r.layout.root]?.sections ?? null };
}

export async function savePageTranslationCentral(
  caller: AuthorizedAdminCaller,
  input: PageTranslationCentralInput
): Promise<{ ok: true; row: Record<string, unknown> } | { ok: false; error: string }> {
  const pageId = (input?.pageId ?? "").toString().trim();
  if (!pageId) return { ok: false, error: "Geçersiz sayfa" };
  const values: Record<string, string | null> = {
    title: normString(input.title) ?? null,
    excerpt: normString(input.excerpt) ?? null,
    body: normString(input.body) ?? null,
    seo_title: normString(input.seoTitle) ?? null,
    seo_description: normString(input.seoDescription) ?? null,
  };
  for (const f of Object.keys(LIMITS) as (keyof typeof LIMITS)[]) {
    const v = values[f];
    if (v && v.length > LIMITS[f]) return { ok: false, error: `${LABELS[f]} ${LIMITS[f]} karakteri geçemez` };
  }
  const patch: Record<string, unknown> = { ...values };
  /* sections: undefined → dokunulmaz; geçersiz/boş → NULL (ana dile düşer). */
  if (input.sections !== undefined) {
    const parsed = parsePageSections(input.sections);
    if (parsed.length && JSON.stringify(parsed).length > MAX_SECTIONS_JSON_LEN) {
      return { ok: false, error: `Bölümler ${MAX_SECTIONS_JSON_LEN} karakteri geçemez` };
    }
    patch.sections = parsed.length ? parsed : null;
  }
  if (input.slug !== undefined) patch.slug = input.slug === null ? null : String(input.slug);
  return saveTranslationRow(caller, "page", pageId, input.locale, patch, { route: "/maki-admin/pages" });
}
