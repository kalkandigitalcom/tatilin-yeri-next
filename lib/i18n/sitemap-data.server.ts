import "server-only";

import { getPgPool } from "@/lib/db/pg.client";
import { SITEMAP_BLOG_ID_SQL, SITEMAP_VILLA_ID_SQL } from "@/lib/i18n/sitemap-sql";

/* ===============================================================
   🌐 SITEMAP VERİSİ — Çok Dilli Mimari Faz 3 (server-only)
   ===============================================================
   Mevcut repository okumalarına (aktif villa / sayfa / blog slug'ları)
   EK iki dar okuma:
     1) noindex işaretli kayıtların slug'ları → sitemap'e GİRMEZ
        (sayfaları noindex döner; sitemap ↔ robots çelişkisi olmaz).
     2) 🌐 Faz 6 Dalga 5: taban slug → kimlik (dil kararı artık merkezi
        servisten; eski çeviri SQL'i kaldırıldı — aşağıya bkz.).
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

/* 🌐 Faz 6 Dalga 5 — eski "çeviri var" SQL kuralı (TR daima mevcut,
   yalnız en/de çeviri tablosu) KALDIRILDI. Blog / CMS / villa / kategori
   dil kararı artık merkezi içerik servisinden ve sayfa metadata'sıyla
   AYNI saf kuraldan gelir (merkezi "public SEO içerik" modülü, app/sitemap.ts).
   Burada yalnız taban slug → kimlik eşlemesi okunur (merkezi okuma
   kimlikle çalışır; mevcut repository projeksiyonları kimlik taşımaz). */

async function idMap(sql: string): Promise<Map<string, string> | null> {
  try {
    const res = await getPgPool().query<{ id: string; slug: string | null }>(sql);
    const out = new Map<string, string>();
    for (const r of res.rows ?? []) if (r?.slug && r.id) out.set(r.slug, String(r.id).toLowerCase());
    return out;
  } catch {
    return null;
  }
}

/** taban slug → kimlik (villa, blog). Hata → null (çağıran bozulma moduna geçer). */
export async function loadSitemapIds(): Promise<{
  villa: Map<string, string> | null;
  blog: Map<string, string> | null;
}> {
  const [villa, blog] = await Promise.all([
    idMap(SITEMAP_VILLA_ID_SQL),
    idMap(SITEMAP_BLOG_ID_SQL),
  ]);
  return { villa, blog };
}
