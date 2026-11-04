import "server-only";

import { getPgPool } from "@/lib/db/pg.client";
import type { Locale } from "@/lib/i18n/config";

/* ===============================================================
   🌐 SITEMAP VERİSİ — Çok Dilli Mimari Faz 3 (server-only)
   ===============================================================
   Mevcut repository okumalarına (aktif villa / sayfa / blog slug'ları)
   EK iki dar okuma:
     1) noindex işaretli kayıtların slug'ları → sitemap'e GİRMEZ
        (sayfaları noindex döner; sitemap ↔ robots çelişkisi olmaz).
     2) Blog / CMS sayfası gerçek çeviri kapsamı → çevirisi olmayan dil
        sitemap'e ve hreflang'e GİRMEZ (content-availability ile aynı
        kural: başlık/gövde/özet dolu çeviri satırı).
   Her okuma bağımsız ve fail-soft: hata → boş küme (eski davranış).
   =============================================================== */

async function slugSet(sql: string): Promise<Set<string>> {
  try {
    const res = await getPgPool().query<{ slug: string | null }>(sql);
    return new Set((res.rows ?? []).map((r) => r.slug).filter((s): s is string => !!s));
  } catch {
    return new Set();
  }
}

export async function loadNoindexSlugs(): Promise<{
  villa: Set<string>;
  page: Set<string>;
  blog: Set<string>;
}> {
  const [villa, page, blog] = await Promise.all([
    slugSet("SELECT slug FROM public.villa WHERE noindex IS TRUE"),
    slugSet("SELECT slug FROM public.pages WHERE noindex IS TRUE"),
    slugSet("SELECT slug FROM public.blog_posts WHERE noindex IS TRUE"),
  ]);
  return { villa, page, blog };
}

const TRANSLATED_SQL = `
  SELECT 'blog' AS kind, p.slug AS base, t.locale
    FROM public.blog_post_translations t JOIN public.blog_posts p ON p.id = t.blog_post_id
   WHERE COALESCE(btrim(t.title), '') <> '' OR COALESCE(btrim(t.body), '') <> ''
      OR COALESCE(btrim(t.excerpt), '') <> ''
  UNION ALL
  SELECT 'page', p.slug, t.locale
    FROM public.page_translations t JOIN public.pages p ON p.id = t.page_id
   WHERE COALESCE(btrim(t.title), '') <> '' OR COALESCE(btrim(t.body), '') <> ''
      OR COALESCE(btrim(t.excerpt), '') <> ''
`;

/** kind → taban slug → çevrilmiş diller (TR her zaman dahil, ayrıca eklenir). */
export async function loadTranslatedContentLocales(): Promise<{
  blog: Map<string, Locale[]>;
  page: Map<string, Locale[]>;
}> {
  const out = { blog: new Map<string, Locale[]>(), page: new Map<string, Locale[]>() };
  try {
    const res = await getPgPool().query<{ kind: "blog" | "page"; base: string; locale: string }>(
      TRANSLATED_SQL
    );
    for (const r of res.rows ?? []) {
      if (!r?.base || (r.locale !== "en" && r.locale !== "de")) continue;
      const m = out[r.kind];
      const list = m.get(r.base) ?? ["tr"];
      if (!list.includes(r.locale)) list.push(r.locale);
      m.set(r.base, list);
    }
  } catch {
    /* fail-soft: çeviri bilgisi yok → yalnız TR listelenir */
  }
  return out;
}
