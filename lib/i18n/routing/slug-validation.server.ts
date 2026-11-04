import "server-only";

import { getPgPool } from "@/lib/db/pg.client";
import type { SlugKind } from "@/lib/i18n/routing/route-registry";
import { checkLocalizedSlugFormat } from "@/lib/i18n/routing/slug-validation";

/* ===============================================================
   🌐 DİL SLUG'I — çakışma kontrolü (server-only)
   ===============================================================
   Aynı türde:
     • başka bir kaydın TR (taban) slug'ı ile aynı olamaz
       (aksi halde o dilde iki kayıt aynı URL'yi ister),
     • aynı dilde başka bir kaydın dil slug'ı ile aynı olamaz
       (DB partial unique index de zorlar; burada anlaşılır mesaj).
   Kaydın KENDİ TR slug'ına eşit olması serbesttir.
   =============================================================== */

const TABLES: Record<SlugKind, { base: string; trans: string; parent: string }> = {
  villa: { base: "villa", trans: "villa_translations", parent: "villa_id" },
  villaType: { base: "villa_types", trans: "villa_type_translations", parent: "type_id" },
  blog: { base: "blog_posts", trans: "blog_post_translations", parent: "blog_post_id" },
  page: { base: "pages", trans: "page_translations", parent: "page_id" },
};

export type LocalizedSlugValidation =
  | { ok: true; slug: string | null }
  | { ok: false; error: string };

export async function validateLocalizedSlug(params: {
  kind: SlugKind;
  entityId: string;
  locale: "en" | "de";
  input: string | null | undefined;
}): Promise<LocalizedSlugValidation> {
  const format = checkLocalizedSlugFormat(params.kind, params.input);
  if (!format.ok || format.slug === null) return format;
  const slug = format.slug;
  const t = TABLES[params.kind];

  try {
    const pool = getPgPool();
    const baseHit = await pool.query(
      `SELECT 1 FROM public.${t.base} WHERE slug = $1 AND id::text <> $2 LIMIT 1`,
      [slug, params.entityId]
    );
    if ((baseHit.rowCount ?? 0) > 0) {
      return { ok: false, error: `"${slug}" başka bir kaydın Türkçe adresi olarak kullanılıyor` };
    }
    const transHit = await pool.query(
      `SELECT 1 FROM public.${t.trans} WHERE locale = $1 AND slug = $2 AND ${t.parent}::text <> $3 LIMIT 1`,
      [params.locale, slug, params.entityId]
    );
    if ((transHit.rowCount ?? 0) > 0) {
      return { ok: false, error: `"${slug}" bu dilde başka bir kayıt tarafından kullanılıyor` };
    }
  } catch {
    return { ok: false, error: "URL slug'ı doğrulanamadı (veritabanı güncellemesi 102 uygulandı mı?)" };
  }
  return { ok: true, slug };
}
