import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getPageBySlug } from "@/app/services/page.service";
import CmsPageBody from "@/app/components/cms/CmsPageBody";
import { buildCmsPageMetadata } from "@/app/components/cms/cms-page-metadata";
import { getCmsPageAssetVersions } from "@/app/components/cms/cms-asset-versions.server";
import { isTextContentMissing, loadTextContent } from "@/lib/i18n/content/public-text-content";
import { publicContentReader } from "@/lib/i18n/content/public-villa-content.server";
import type { LocaleRouteProps, UnifiedLocalePageModule } from "@/lib/i18n/routing/locale-route";

/* ===============================================================
   🌐 CMS SAYFASI (/p/:slug) — TEK, DİLE DUYARLI ROUTE (Faz 6 Dalga 3)
   ===============================================================
   Eski üç kopya (`app/p/[slug]`, `(public)/en|de/p/[slug]`
   `locale-page.tsx`) yerine. Dil dispatcher'dan (localeRouteFor "page")
   AÇIKÇA gelir; `params.slug` TEKNİK ANAHTARDIR.

   • Kayıt: `getPageBySlug` (yalnız aktif sayfa) AYNEN.
   • Çevrilebilir içerik (başlık, özet, gövde, bölümler) MERKEZİ
     servisten: istenen → ana dil → aktif diller; gövde için `pages.content`
     ek yedeği ve bilinçli boş gövde (Faz 3.1 / Faz 5) merkezi depoda.
   • Bölümler (sections) ve görsel `?v=` versiyonları, çözülmüş bölümlerle
     eskisi gibi; render CmsPageBody'de DEĞİŞMEDİ.
   • 404: kayıt yoksa / içerik hiçbir aktif dilde yoksa BÜTÜN dillerde
     `notFound()` (eski TR modülündeki 200 dönen satır içi Türkçe 404
     bloğu kaldırıldı — EN/DE zaten notFound kullanıyordu; proxy canlı
     küme kontrolüyle bu duruma pratikte hiç düşülmez).
   =============================================================== */
export async function CmsPageRoutePage({ locale, params }: LocaleRouteProps) {
  const slug = params.slug;
  const page = await getPageBySlug(slug);
  if (!page) notFound();

  const { content, resolved } = await loadTextContent(
    publicContentReader,
    "page",
    String((page as { id?: string }).id ?? ""),
    locale
  );
  if (isTextContentMissing("page", content)) notFound();

  /* 🛡️ Görsel `?v=` versiyonları (R2 ETag; path aynı). */
  const assetVersions = await getCmsPageAssetVersions(page, resolved.sections);

  return (
    <CmsPageBody
      locale={locale}
      slug={slug}
      page={page}
      title={resolved.title}
      resolvedExcerpt={resolved.excerpt}
      body={resolved.body}
      resolvedSections={resolved.sections}
      assetVersions={assetVersions}
    />
  );
}

export async function cmsPageRouteMetadata({ locale, params }: LocaleRouteProps): Promise<Metadata> {
  return buildCmsPageMetadata(params.slug, locale);
}

export const cmsPageRouteModule: UnifiedLocalePageModule = {
  Page: CmsPageRoutePage,
  generateMetadata: cmsPageRouteMetadata,
};
