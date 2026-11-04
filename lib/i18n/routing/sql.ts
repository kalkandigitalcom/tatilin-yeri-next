import { isSupportedLocale } from "@/lib/i18n/config";
import type { LiveSlugSets, LocalizedSlugMap, RedirectMap } from "@/lib/i18n/routing/context";
import type { SlugKind } from "@/lib/i18n/routing/route-registry";

/* ===============================================================
   🌐 ROUTING SQL — proxy ve server bağlamının ORTAK sorguları
   ===============================================================
   Hem `proxy.ts` (proxy-config.ts, server-only değil) hem server
   bağlamı (slug-map.server.ts) AYNI sorguları ve AYNI satır→harita
   dönüşümünü kullanır → iki katman aynı URL kararını verir.
   =============================================================== */

/** Dil slug'ları (migration 102). Yalnız dolu slug'lar. */
export const LOCALIZED_SLUGS_SQL = `
  SELECT 'villa' AS kind, p.slug AS base, t.locale, t.slug
    FROM public.villa_translations t JOIN public.villa p ON p.id = t.villa_id
   WHERE t.slug IS NOT NULL AND p.slug IS NOT NULL
  UNION ALL
  SELECT 'villaType', p.slug, t.locale, t.slug
    FROM public.villa_type_translations t JOIN public.villa_types p ON p.id = t.type_id
   WHERE t.slug IS NOT NULL AND p.slug IS NOT NULL
  UNION ALL
  SELECT 'blog', p.slug, t.locale, t.slug
    FROM public.blog_post_translations t JOIN public.blog_posts p ON p.id = t.blog_post_id
   WHERE t.slug IS NOT NULL AND p.slug IS NOT NULL
  UNION ALL
  SELECT 'page', p.slug, t.locale, t.slug
    FROM public.page_translations t JOIN public.pages p ON p.id = t.page_id
   WHERE t.slug IS NOT NULL AND p.slug IS NOT NULL
`;

/** Slug geçmişi (migration 103) → YALNIZ yayındaki içeriklerin GÜNCEL
 *  taban slug'ı. Pasif / silinmiş içerik → satır gelmez → yönlendirme
 *  üretilmez. Eski slug bugün canlı bir taban slug'ı ise atlanır
 *  (canlı içerik her zaman önceliklidir). */
export const REDIRECTS_SQL = `
  WITH r AS (
    SELECT r.entity_kind AS kind, r.locale, r.old_slug, r.entity_id FROM public.url_redirects r
  )
  SELECT r.kind, r.locale, r.old_slug, p.slug AS base FROM r
    JOIN public.villa p ON p.id = r.entity_id AND p.is_active = true AND p.deleted_at IS NULL
   WHERE r.kind = 'villa' AND p.slug IS NOT NULL AND p.slug <> r.old_slug
     AND NOT EXISTS (SELECT 1 FROM public.villa x WHERE x.slug = r.old_slug)
  UNION ALL
  SELECT r.kind, r.locale, r.old_slug, p.slug FROM r
    JOIN public.villa_types p ON p.id = r.entity_id
   WHERE r.kind = 'villaType' AND p.slug IS NOT NULL AND p.slug <> r.old_slug
     AND NOT EXISTS (SELECT 1 FROM public.villa_types x WHERE x.slug = r.old_slug)
  UNION ALL
  SELECT r.kind, r.locale, r.old_slug, p.slug FROM r
    JOIN public.blog_posts p ON p.id = r.entity_id AND p.is_active = true
   WHERE r.kind = 'blog' AND p.slug IS NOT NULL AND p.slug <> r.old_slug
     AND NOT EXISTS (SELECT 1 FROM public.blog_posts x WHERE x.slug = r.old_slug)
  UNION ALL
  SELECT r.kind, r.locale, r.old_slug, p.slug FROM r
    JOIN public.pages p ON p.id = r.entity_id AND p.is_active = true
   WHERE r.kind = 'page' AND p.slug IS NOT NULL AND p.slug <> r.old_slug
     AND NOT EXISTS (SELECT 1 FROM public.pages x WHERE x.slug = r.old_slug)
`;

/** Faz 3 son kontrol — YAYINDAKİ içeriklerin taban slug'ları (proxy
 *  404 kararı). Filtreler public detay sorgularıyla BİREBİR:
 *    villa      → villaRepository.findBySlug (is_active, deleted_at IS NULL)
 *    blog/page  → blog/pages repository.findBySlug (is_active)
 *  Her tür AYRI sorgudur: biri başarısız olursa yalnız o tür kontrol
 *  edilmez (sayfa kendi notFound'una düşer). */
export const LIVE_SLUGS_SQL: Readonly<Partial<Record<"villa" | "blog" | "page", string>>> = {
  villa: `SELECT slug FROM public.villa WHERE is_active = true AND deleted_at IS NULL AND slug IS NOT NULL`,
  blog: `SELECT slug FROM public.blog_posts WHERE is_active = true AND slug IS NOT NULL`,
  page: `SELECT slug FROM public.pages WHERE is_active = true AND slug IS NOT NULL`,
};

export function rowsToLiveSet(rows: readonly { slug?: unknown }[]): ReadonlySet<string> {
  const out = new Set<string>();
  for (const r of rows) if (typeof r?.slug === "string" && r.slug) out.add(r.slug);
  return out;
}

export type { LiveSlugSets };

type SlugRow = { kind: SlugKind; base: string; locale: string; slug: string };
type RedirectRow = { kind: SlugKind; locale: string; old_slug: string; base: string };

export function rowsToSlugMap(rows: readonly SlugRow[]): LocalizedSlugMap {
  const map: LocalizedSlugMap = {};
  for (const r of rows) {
    if (!r?.base || !r?.slug || !isSupportedLocale(r.locale) || r.locale === "tr") continue;
    const byBase = (map[r.kind] ??= {});
    (byBase[r.base] ??= {})[r.locale] = r.slug;
  }
  return map;
}

export function rowsToRedirectMap(rows: readonly RedirectRow[]): RedirectMap {
  const map: RedirectMap = {};
  for (const r of rows) {
    if (!r?.old_slug || !r?.base || !isSupportedLocale(r.locale)) continue;
    const byLocale = (map[r.kind] ??= {});
    (byLocale[r.locale] ??= {})[r.old_slug] = r.base;
  }
  return map;
}
