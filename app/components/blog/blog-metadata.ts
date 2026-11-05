import "server-only";

import type { Metadata } from "next";

import { getBlogPostBySlug } from "@/app/services/blog.service";
import { stripHtml } from "@/lib/html-sanitize";
import { resolveAssetUrl } from "@/lib/storage.helpers";
import { versionedAssetUrl } from "@/lib/storage/site-asset-version";
import { getSiteAssetVersions } from "@/lib/storage/site-asset-version.server";
import { getCachedSettings } from "@/lib/cache.helpers";
import {
  DEFAULT_LOCALE,
  getEnabledPublicLocales,
  type Locale,
} from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { buildLocaleAlternates, pickSeoAlternates } from "@/lib/i18n/seo-alternates";
/* 🌐 Faz 6 Dalga 3 — çevrilebilir içerik ve "bu dilde çeviri var" kararı
   MERKEZİ okuma servisinden (eski get-blog-translation / content-availability
   yerine; TR artık "daima mevcut" sayılmaz — simetrik kural). */
import {
  isTextContentMissing,
  loadAvailableLocales,
  loadTextContent,
  textRobots,
} from "@/lib/i18n/content/public-text-content";
import { publicContentReader } from "@/lib/i18n/content/public-villa-content.server";

/* ===============================================================
   🛡️ BLOG METADATA (TR / EN / DE ORTAK)
   ===============================================================
   `app/components/cms/cms-page-metadata.ts` (Phase 12D) ile AYNI
   desen: üç locale de TEK helper üzerinden kendi `generateMetadata`
   fonksiyonunu üretir.

   TR ÇIKTISI DEĞİŞMEDİ:
     • title/description/openGraph/twitter/robots mantığı TR
       sayfasından BİREBİR taşındı.
     • `alternates`: `multilingual_enabled` KAPALIYKEN yalnız
       `{ canonical }` döner — TR çıktısı eskisiyle AYNI. Açıkken
       hreflang seti eklenir (`buildLocaleAlternates`, Phase 7B).

   🌐 Faz 6 Dalga 3: seo_title / seo_description / title / excerpt / body
   BÜTÜN dillerde merkezi servisten (alan bazında istenen → ana dil →
   aktif diller). `post.noindex` HER locale'de aynen uygulanır. URL'de
   dilin slug'ı (route kaydı + routing bağlamı); `post.slug` teknik anahtar.
   =============================================================== */

export function excerptFrom(text: string, max = 160): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return t.slice(0, max).replace(/\s+\S*$/, "").trim() + "…";
}

export async function buildBlogIndexMetadata(
  locale: Locale = DEFAULT_LOCALE
): Promise<Metadata> {
  const dict = getDictionary(locale).blog;
  const settings = await getCachedSettings().catch(() => null);

  const { canonical, languages } = buildLocaleAlternates("/blog", locale);

  return {
    title: dict.metaTitle,
    description: dict.metaDescription,
    alternates: pickSeoAlternates(settings, canonical, languages),
    openGraph: {
      type: "website",
      title: dict.metaTitle,
      description: dict.ogDescription,
      url: canonical,
    },
  };
}

export async function buildBlogDetailMetadata(
  params: Promise<{ slug: string }>,
  locale: Locale = DEFAULT_LOCALE
): Promise<Metadata> {
  const dict = getDictionary(locale).blog;
  const { slug } = await params;
  /* Yayın filtresi (is_active) ve teknik alanlar (tarih, kapak, yazar)
     eski servisten AYNEN; `slug` teknik anahtardır. */
  const post = await getBlogPostBySlug(slug);
  if (!post) {
    return {
      title: dict.detailNotFoundTitle,
      robots: { index: false, follow: false },
    };
  }

  const { content, resolved } = await loadTextContent(
    publicContentReader,
    "blog_post",
    String(post.id),
    locale
  );
  /* İçerik hiçbir aktif dilde yoksa sayfa 404 (Faz 3.1) — metadata da
     "bulunamadı" + noindex. */
  if (isTextContentMissing("blog_post", content)) {
    return {
      title: dict.detailNotFoundTitle,
      robots: { index: false, follow: false },
    };
  }

  const title = resolved.seoTitle?.trim() || resolved.title || "";
  const description =
    resolved.seoDescription?.trim() ||
    (resolved.excerpt?.trim() ? resolved.excerpt.trim() : "") ||
    (resolved.body ? excerptFrom(stripHtml(resolved.body), 160) : "");
  /* 🛡️ OG/Twitter görseli `?v=<R2 ETag>` ile (path aynı). */
  const ogPath = post.og_image || post.cover_image;
  const cover =
    versionedAssetUrl(
      resolveAssetUrl(ogPath),
      await getSiteAssetVersions([ogPath]),
      ogPath
    ) || undefined;

  const settings = await getCachedSettings().catch(() => null);
  const { canonical, languages } = buildLocaleAlternates(
    `/blog/${post.slug}`,
    locale
  );
  /* 🌐 Faz 3 / Faz 6 Dalga 3 — bu dilde gerçek çeviri yoksa noindex +
     hreflang dışı; canonical kendi URL'si. Tek dilli sitede ek okuma YOK. */
  const available = await loadAvailableLocales(
    publicContentReader,
    "blog_post",
    String(post.id),
    getEnabledPublicLocales(settings),
    { locale, content }
  );
  const robots = textRobots("blog", post.noindex, available.includes(locale));

  return {
    title,
    description,
    alternates: pickSeoAlternates(settings, canonical, languages, { available, locale }),
    robots,
    openGraph: {
      type: "article",
      title,
      description,
      url: canonical,
      ...(cover ? { images: [{ url: cover }] } : {}),
    },
    twitter: {
      card: cover ? "summary_large_image" : "summary",
      title,
      description,
      ...(cover ? { images: [cover] } : {}),
    },
  };
}
