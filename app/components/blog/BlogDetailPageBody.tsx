import { localeHref } from "@/lib/i18n/locale-href";
import { notFound } from "next/navigation";
import Image from "next/image";

import { getBlogPostBySlug } from "@/app/services/blog.service";
import { sanitizeHtml, stripHtml } from "@/lib/html-sanitize";
import { resolveAssetUrl } from "@/lib/storage.helpers";
import { versionedAssetUrl } from "@/lib/storage/site-asset-version";
import { getSiteAssetVersions } from "@/lib/storage/site-asset-version.server";
import PageHero from "@/app/components/ui/PageHero";
import {
  JsonLd,
  buildArticle,
  buildBreadcrumb,
} from "@/app/components/seo/StructuredData";

/* 🛡️ PUBLIC ÇOKLU DİL — statik metinler MEVCUT public dictionary'den
   (`blog` namespace); yazı başlığı/özeti/gövdesi ve SEO alanları
   `blog_post_translations`'tan (migration 089) gelir — request başına
   EN FAZLA 1 çeviri sorgusu, TR'de SIFIR. `slug`, kapak görseli,
   kategori, yazar ve yayın tarihi ÇEVRİLMEZ. */
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";
/* 🌐 Faz 6 Dalga 3 — çevrilebilir içerik MERKEZİ servisten. */
import { isTextContentMissing, loadTextContent } from "@/lib/i18n/content/public-text-content";
import { publicContentReader } from "@/lib/i18n/content/public-villa-content.server";
import { excerptFrom } from "@/app/components/blog/blog-metadata";

/* ===============================================================
   🛡️ BLOG DETAY GÖVDESİ — /blog/[slug] · /en/... · /de/...
   ===============================================================
   TR/EN/DE ORTAK gövde; route dosyaları ince sarmalayıcıdır.
   getBlogPostBySlug (taslak → 404), body → sanitizeHtml (XSS),
   Article & Breadcrumb JSON-LD akışı DEĞİŞTİRİLMEDİ.
   =============================================================== */

export default async function BlogDetailPageBody({
  params,
  locale = DEFAULT_LOCALE,
}: {
  params: Promise<{ slug: string }>;
  /* 🛡️ Opsiyonel — verilmezse "tr" → TR çıktısı BİREBİR eskisi gibi. */
  locale?: Locale;
}) {
  const dict = getDictionary(locale).blog;
  /* 🌐 Faz 2 — linkler merkezi URL üreticisinden (localeHref). */

  const { slug } = await params;
  const post = await getBlogPostBySlug(slug);
  if (!post) notFound();

  const { content, resolved } = await loadTextContent(
    publicContentReader,
    "blog_post",
    String(post.id),
    locale
  );
  /* İçerik hiçbir aktif dilde yoksa 404 (Faz 3.1) — yanlış/pasif dil
     içeriği veya teknik anahtar GÖSTERİLMEZ. */
  if (isTextContentMissing("blog_post", content)) notFound();
  const title = resolved.title || "";
  const excerpt = resolved.excerpt;
  const body = resolved.body;

  /* 🛡️ Kapak `?v=<R2 ETag>` (path aynı; versiyon yoksa URL aynen). */
  const cover = versionedAssetUrl(
    resolveAssetUrl(post.cover_image),
    await getSiteAssetVersions([post.cover_image]),
    post.cover_image
  );

  const articleLd = buildArticle({
    slug: post.slug,
    /* 🌐 Faz 6 Dalga 3 — dilin kanonik yolu (dil slug'ı + önek). */
    path: localeHref(`/blog/${post.slug}`, locale),
    title,
    description:
      resolved.seoDescription?.trim() ||
      excerpt?.trim() ||
      (body ? excerptFrom(stripHtml(body), 160) : null),
    image: post.og_image || post.cover_image,
    datePublished: post.published_at,
    dateModified: post.updated_at,
    author: post.author,
  });
  const breadcrumbLd = buildBreadcrumb([
    { name: dict.breadcrumbHome, url: localeHref("/", locale) },
    { name: dict.breadcrumbBlog, url: localeHref(`/blog`, locale) },
    { name: title },
  ]);

  /* 🛡️ TASARIM — CMS sayfa detayı (app/p/[slug]) ile BİREBİR hizalı. */
  return (
    <article className="bg-white">
      <JsonLd data={articleLd} />
      <JsonLd data={breadcrumbLd} />

      <PageHero
        breadcrumb={[
          { name: dict.breadcrumbHome, href: localeHref("/", locale) },
          { name: dict.breadcrumbBlog, href: localeHref(`/blog`, locale) },
          { name: title },
        ]}
        eyebrow={post.category || dict.eyebrow}
        title={title}
        description={excerpt || undefined}
      />

      <section className="px-5 md:px-10 lg:px-16 pb-32 md:pb-44 pt-12 md:pt-16">
        <div className="max-w-[1100px] mx-auto space-y-12 md:space-y-16">
          {cover && (
            <div className="relative aspect-[16/9] overflow-hidden rounded-3xl bg-[var(--color-sand-50)]">
              <Image
                src={cover}
                alt={title}
                fill
                priority
                sizes="(max-width: 768px) 100vw, (max-width: 1280px) 90vw, 1100px"
                className="object-cover object-center"
                unoptimized
              />
            </div>
          )}

          {body && body.trim() ? (
            <div
              className="villa-description text-[16px] md:text-[17px] leading-[1.8] text-[var(--color-stone-700)]"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(body) }}
            />
          ) : excerpt ? (
            <p className="text-[16px] md:text-[17px] leading-[1.8] text-[var(--color-stone-700)]">
              {excerpt}
            </p>
          ) : (
            <p className="text-[var(--color-stone-400)] italic text-center">
              {dict.contentComing}
            </p>
          )}
        </div>
      </section>
    </article>
  );
}
