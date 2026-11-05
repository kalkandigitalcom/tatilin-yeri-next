import "server-only";

import type { AuthorizedAdminCaller } from "@/lib/admin-route-auth";
import type { Locale } from "@/lib/i18n/config";
import { sanitizeHtml } from "@/lib/html-sanitize";
import { blogServerRepository } from "@/lib/db/blog.repository.server";
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
   🌐 BLOG — Faz 5 dalga 2 merkezi okuma/yazma
   ===============================================================
   Çevrilebilir (dil başına ayrı): title, body, excerpt, seo_title,
   seo_description + dil URL slug'ı (çeviri satırında).
   Dilden bağımsız (ana tablo, teknik yama): cover_image, og_image,
   category, author, is_active, published_at, updated_at.
   `blog_posts.slug` TEKNİK ANAHTARDIR: yalnız oluşturmada yazılır,
   dil değişimi / başlık değişimi onu etkilemez.
   Yayın durumu/tarihi anlamı AYNEN: is_active=true olunca published_at
   yoksa now(); false olunca published_at korunur.
   Gövde HER DİLDE sanitizeHtml'den geçer (eski çeviri yolu EN/DE gövdeyi
   temizlemiyordu → güvenlik iyileştirmesi).
   Yetki kontrolü ÇAĞIRAN route/eylemde yapılır.
   =============================================================== */

export const BLOG_CONTENT_FIELDS = ["title", "body", "excerpt", "seo_title", "seo_description"] as const;

const LIMITS = { title: 200, excerpt: 300, body: 20000, seo_title: 120, seo_description: 300 } as const;
const LABELS = { title: "Başlık", excerpt: "Kısa açıklama", body: "İçerik", seo_title: "SEO başlık", seo_description: "SEO açıklama" } as const;

const str = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
};

export type BlogSaveResult =
  | { ok: true; id?: string }
  | { ok: false; status: number; error: string };

function statusOf(code: string | undefined): number {
  if (code === "validation") return 400;
  if (code === "conflict") return 409;
  if (code === "guard") return 409;
  if (code === "not-found") return 404;
  if (code === "busy") return 503;
  return 500;
}

/** Ana form içeriği (ana dil). Eski route normalizasyonu AYNEN:
 *  title trim, body sanitize (string ise), excerpt/seo_* boş → null. */
function rootContentPatch(body: Record<string, unknown>, mode: "create" | "update"): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  if (mode === "create") {
    p.title = str(body.title);
    p.excerpt = str(body.excerpt);
    p.body = typeof body.body === "string" ? sanitizeHtml(body.body) : null;
    p.seo_title = str(body.seo_title);
    p.seo_description = str(body.seo_description);
    return p;
  }
  if (typeof body.title === "string") p.title = body.title.trim();
  if (body.excerpt !== undefined) p.excerpt = str(body.excerpt);
  if (typeof body.body === "string") p.body = sanitizeHtml(body.body);
  if (body.seo_title !== undefined) p.seo_title = str(body.seo_title);
  if (body.seo_description !== undefined) p.seo_description = str(body.seo_description);
  return p;
}

export async function createBlogCentral(
  caller: AuthorizedAdminCaller,
  body: Record<string, unknown>
): Promise<BlogSaveResult> {
  const title = str(body.title);
  const handle = str(body.slug);
  if (!title || !handle) return { ok: false, status: 400, error: "Başlık ve slug zorunlu" };
  const layout = await getAdminLocaleLayout();
  const isActive = body.is_active === true;
  const patch = rootContentPatch(body, "create");
  /* Ana dil TR değilse ana dilin URL slug'ı = teknik anahtar (TR için 108
     INSERT tohumu / ayna aynı sonucu verir). */
  if (layout.root !== "tr") patch.slug = handle;
  const r = await adminCreateContent(caller, {
    entity: "blog_post",
    technical: {
      slug: handle,
      cover_image: str(body.cover_image),
      category: str(body.category),
      author: str(body.author),
      og_image: str(body.og_image),
      is_active: isActive,
      published_at: isActive ? new Date().toISOString() : null,
    },
    locales: [{ locale: layout.root, patch }],
    title,
    route: "/maki-admin/blog",
  });
  if (!r.ok) {
    const code = (r as { code?: string }).code;
    return {
      ok: false,
      status: statusOf(code),
      error: code === "conflict" ? "Bu slug zaten kullanılıyor" : r.error || "Eklenemedi",
    };
  }
  return { ok: true, id: r.id };
}

export async function updateBlogCentral(
  caller: AuthorizedAdminCaller,
  id: string,
  body: Record<string, unknown>
): Promise<BlogSaveResult> {
  const layout = await getAdminLocaleLayout();
  const content = rootContentPatch(body, "update");

  /* Ana dil URL slug'ı: yalnız GERÇEKTEN değiştiyse yazılır (aynı değerin
     geri gönderilmesi TR slug kilidine takılmasın). Boş → temizle (URL =
     teknik anahtar). Teknik anahtar (`blog_posts.slug`) ASLA yazılmaz. */
  if (typeof body.slug === "string") {
    const next = body.slug.trim() || null;
    const [all, technicalKey] = await Promise.all([getAdminContent("blog_post", id), getTechnicalKey("blog_post", id)]);
    const cur = (all[layout.root]?.slug as string | null | undefined) ?? null;
    const effective = cur ?? technicalKey;
    if (next !== effective && !(next === null && cur === null)) content.slug = next;
  }

  const technical: Record<string, unknown> = {};
  if (body.cover_image !== undefined) technical.cover_image = str(body.cover_image);
  if (body.category !== undefined) technical.category = str(body.category);
  if (body.author !== undefined) technical.author = str(body.author);
  if (body.og_image !== undefined) technical.og_image = str(body.og_image);
  if (typeof body.is_active === "boolean") {
    technical.is_active = body.is_active;
    if (body.is_active) {
      const { data: existing } = await blogServerRepository.findPublishedAt(id);
      if (existing && !(existing as { published_at?: unknown }).published_at) {
        technical.published_at = new Date().toISOString();
      }
    }
  }
  if (Object.keys(content).length === 0 && Object.keys(technical).length === 0) {
    return { ok: false, status: 400, error: "Güncellenecek alan yok" };
  }
  technical.updated_at = new Date().toISOString();

  const r = await adminSaveContentMany(caller, {
    entity: "blog_post",
    entityId: id,
    action: "content.update",
    title: typeof content.title === "string" ? content.title : null,
    route: "/maki-admin/blog",
    items: Object.keys(content).length ? [{ entity: "blog_post", parentId: id, locale: layout.root, patch: content }] : [],
    technical: [{ entity: "blog_post", parentId: id, values: technical }],
  });
  if (!r.ok) {
    const code = (r as { code?: string }).code;
    return {
      ok: false,
      status: statusOf(code),
      error:
        code === "guard" && "slug" in content
          ? "Türkçe URL slug'ı teknik anahtardan ayrılmadan (migration 108) değiştirilemez"
          : r.error || "Güncellenemedi",
    };
  }
  return { ok: true };
}

/** GET [id]: içerik alanları ANA DİLİN değeriyle; `slug` = ana dilin URL
 *  slug'ı (yoksa teknik anahtar). Ek: technical_key, root_locale, slug_separated. */
export async function overlayBlogRoot(row: Record<string, unknown>): Promise<Record<string, unknown>> {
  const id = String(row.id ?? "");
  const layout = await getAdminLocaleLayout();
  const [all, slugSeparated] = await Promise.all([getAdminContent("blog_post", id), getSlugSeparationCapability()]);
  const root = all[layout.root];
  const out: Record<string, unknown> = { ...row, technical_key: row.slug ?? null, root_locale: layout.root, slug_separated: slugSeparated };
  if (root || layout.root !== "tr") {
    for (const f of BLOG_CONTENT_FIELDS) out[f] = (root?.[f] as unknown) ?? (f === "title" ? "" : null);
    out.slug = (root?.slug as string | null | undefined) ?? row.slug ?? "";
  }
  return out;
}

export async function localizeBlogList<T extends { id: string }>(rows: readonly T[]) {
  return localizeAdminRows("blog_post", rows, ["title"]);
}

/* ---------------- Çeviri kartı (ana dil DIŞINDAKİ diller) ---------------- */

export type BlogTranslationCentralInput = {
  postId: string;
  locale: string;
  title?: string | null;
  excerpt?: string | null;
  body?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  slug?: string | null;
};

export async function loadBlogTranslationsCentral(
  postId: string
): Promise<{ ok: true; rows: Array<{ locale: Locale } & Record<string, unknown>>; layout: AdminLocaleLayout; technicalKey: string | null; slugSeparated: boolean } | { ok: false; error: string }> {
  const r = await loadTranslationRows("blog_post", postId, BLOG_CONTENT_FIELDS);
  if (!r.ok) return r;
  const [technicalKey, slugSeparated] = await Promise.all([getTechnicalKey("blog_post", postId), getSlugSeparationCapability()]);
  return { ...r, technicalKey, slugSeparated };
}

export async function saveBlogTranslationCentral(
  caller: AuthorizedAdminCaller,
  input: BlogTranslationCentralInput
): Promise<{ ok: true; row: Record<string, unknown> } | { ok: false; error: string }> {
  const postId = (input?.postId ?? "").toString().trim();
  if (!postId) return { ok: false, error: "Geçersiz blog yazısı" };
  const values: Record<string, string | null> = {
    title: str(input.title),
    excerpt: str(input.excerpt),
    body: str(input.body),
    seo_title: str(input.seoTitle),
    seo_description: str(input.seoDescription),
  };
  for (const f of Object.keys(LIMITS) as (keyof typeof LIMITS)[]) {
    const v = values[f];
    if (v && v.length > LIMITS[f]) return { ok: false, error: `${LABELS[f]} ${LIMITS[f]} karakteri geçemez` };
  }
  if (values.body) values.body = sanitizeHtml(values.body);
  const patch: Record<string, unknown> = { ...values };
  if (input.slug !== undefined) patch.slug = input.slug === null ? null : String(input.slug);
  return saveTranslationRow(caller, "blog_post", postId, input.locale, patch, { route: "/maki-admin/blog" });
}
