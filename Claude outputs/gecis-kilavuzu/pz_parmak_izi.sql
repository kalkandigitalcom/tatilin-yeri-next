-- PZ — değişmemesi gereken verinin parmak izi (salt okunur). Her migration'dan ÖNCE ve SONRA çalıştır, çıktıları karşılaştır.
BEGIN TRANSACTION READ ONLY;
SELECT tablo, satir, iz FROM (
  SELECT 'villa_translations (tr hariç)' AS tablo, count(*) AS satir, md5(coalesce(string_agg(t::text,'|' ORDER BY t.id),'')) AS iz FROM public.villa_translations t WHERE locale<>'tr'
  UNION ALL SELECT 'villa_type_translations (tr hariç)', count(*), md5(coalesce(string_agg(t::text,'|' ORDER BY t.id),'')) FROM public.villa_type_translations t WHERE locale<>'tr'
  UNION ALL SELECT 'villa_feature_translations (tr hariç)', count(*), md5(coalesce(string_agg(t::text,'|' ORDER BY t.id),'')) FROM public.villa_feature_translations t WHERE locale<>'tr'
  UNION ALL SELECT 'rule_item_translations (tr hariç)', count(*), md5(coalesce(string_agg(t::text,'|' ORDER BY t.id),'')) FROM public.rule_item_translations t WHERE locale<>'tr'
  UNION ALL SELECT 'price_include_item_translations (tr hariç)', count(*), md5(coalesce(string_agg(t::text,'|' ORDER BY t.id),'')) FROM public.price_include_item_translations t WHERE locale<>'tr'
  UNION ALL SELECT 'blog_post_translations (tr hariç)', count(*), md5(coalesce(string_agg(t::text,'|' ORDER BY t.id),'')) FROM public.blog_post_translations t WHERE locale<>'tr'
  UNION ALL SELECT 'page_translations (tr hariç)', count(*), md5(coalesce(string_agg(t::text,'|' ORDER BY t.id),'')) FROM public.page_translations t WHERE locale<>'tr'
  UNION ALL SELECT 'faq_translations (tr hariç)', count(*), md5(coalesce(string_agg(t::text,'|' ORDER BY t.id),'')) FROM public.faq_translations t WHERE locale<>'tr'
  UNION ALL SELECT 'menu_translations (tr hariç)', count(*), md5(coalesce(string_agg(t::text,'|' ORDER BY t.id),'')) FROM public.menu_translations t WHERE locale<>'tr'
  UNION ALL SELECT 'payment_method_translations (tr hariç)', count(*), md5(coalesce(string_agg(t::text,'|' ORDER BY t.id),'')) FROM public.payment_method_translations t WHERE locale<>'tr'
  UNION ALL SELECT 'settings_translations (tr hariç)', count(*), md5(coalesce(string_agg(t::text,'|' ORDER BY t.id),'')) FROM public.settings_translations t WHERE locale<>'tr'
  UNION ALL SELECT 'site_popup_translations (tr hariç)', count(*), md5(coalesce(string_agg(t::text,'|' ORDER BY t.id),'')) FROM public.site_popup_translations t WHERE locale<>'tr'
  UNION ALL SELECT 'url_redirects', count(*), md5(coalesce(string_agg(r::text,'|' ORDER BY r.id),'')) FROM public.url_redirects r
  UNION ALL SELECT 'villa', count(*), md5(coalesce(string_agg(b::text,'|' ORDER BY b.id),'')) FROM public.villa b
  UNION ALL SELECT 'blog_posts', count(*), md5(coalesce(string_agg(b::text,'|' ORDER BY b.id),'')) FROM public.blog_posts b
  UNION ALL SELECT 'pages', count(*), md5(coalesce(string_agg(b::text,'|' ORDER BY b.id),'')) FROM public.pages b
  UNION ALL SELECT 'settings', count(*), md5(coalesce(string_agg(b::text,'|' ORDER BY b.id),'')) FROM public.settings b
) x ORDER BY tablo;
ROLLBACK;
