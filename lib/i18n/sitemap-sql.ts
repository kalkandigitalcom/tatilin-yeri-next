/* 🌐 Faz 6 Dalga 5 — sitemap'in taban slug → kimlik SQL'leri (saf sabitler;
   izole PG testinde gerçek şemaya karşı doğrulanır). Yalnız SELECT. */
export const SITEMAP_VILLA_ID_SQL =
  "SELECT id::text AS id, slug FROM public.villa WHERE slug IS NOT NULL AND deleted_at IS NULL";
export const SITEMAP_BLOG_ID_SQL =
  "SELECT id::text AS id, slug FROM public.blog_posts WHERE slug IS NOT NULL";
