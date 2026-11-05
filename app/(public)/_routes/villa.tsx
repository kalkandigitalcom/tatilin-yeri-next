import type { Metadata } from "next";
import { cache } from "react";

import { localeHref } from "@/lib/i18n/locale-href";
import type { Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { buildLocaleAlternates, pickSeoAlternates } from "@/lib/i18n/seo-alternates";
import { hasNoContentAnywhere } from "@/lib/i18n/content/public-seo-content";
import type { LocaleRouteProps, UnifiedLocalePageModule } from "@/lib/i18n/routing/locale-route";
import {
  labelItems,
  loadContentLabels,
  loadVillaDetailContent,
  villaRobots,
} from "@/lib/i18n/content/public-villa-content";
import { publicContentReader } from "@/lib/i18n/content/public-villa-content.server";

import VillaDetailBody from "@/app/components/villa/VillaDetailBody";
import type { TranslatedDistance } from "@/app/components/villa/VillaDistancesSection";
import type { TranslatedFeature } from "@/app/components/villa/VillaFeaturesSection";
import type {
  TranslatedPriceInclude,
  TranslatedRule,
} from "@/app/components/villa/VillaPriceIncludesAndRulesSection";

/* Teknik veri: eski üç modülün KULLANDIĞI AYNI servisler, AYNI argümanlar. */
import { getVillaBySlug } from "@/app/services/villa.service";
import { getVillaImages } from "@/app/services/villa-image/villa-image.read";
import { getVillaPrices } from "@/app/services/villa-price.service";
import { getVillaDiscounts } from "@/app/services/villa-discount.service";
import { getVillaDistances } from "@/app/services/villa-distance.service";
import { getVillaFeaturesByVilla, type Feature } from "@/app/services/villa-feature.service";
import { getRuleItemsByVilla } from "@/app/services/rule-item.service";
import { getPriceIncludeItemsByVilla } from "@/app/services/price-include-item.service";
import {
  getCachedSettings,
  getCachedVillaReviews,
  getCachedVillaReviewStats,
} from "@/lib/cache.helpers";
import { resolveVillaImageUrl, resolveAssetUrlVersioned } from "@/lib/storage.helpers";
import {
  fetchExternalCalendarStringsForVilla,
  EMPTY_EXTERNAL_STRING_ARRAYS,
} from "@/lib/external-calendar.public.helper";
import { normalizeYouTubeVideos, type VillaYouTubeVideo } from "@/lib/youtube.helper";
import { buildBreadcrumb, buildVacationRental } from "@/app/components/seo/StructuredData";
import { stripHtml } from "@/lib/html-sanitize";
import { isValidYmd } from "@/lib/availability.helper";
import { getDistanceIconKey } from "@/lib/distance.helper";
import { getTranslatedDistanceLabel } from "@/lib/distance-label.helper";

/* ===============================================================
   🌐 VİLLA DETAY — TEK, DİLE DUYARLI ROUTE (Faz 6 Dalga 2)
   ===============================================================
   Eski üç kopyanın (`(public)/kiralik-villa/[slug]`, `(public)/en|de/…`
   `locale-page.tsx`) yerine. Dil dispatcher'dan (localeRouteFor "villa")
   AÇIKÇA gelir; `params.slug` daima TEKNİK ANAHTARDIR (dispatcher dil
   slug'ını çözer, kanonik değilse 308).

   DEĞİŞEN (yalnız çevrilebilir içerik):
     • açıklama, SEO başlığı/açıklaması → getContent("villa")
     • özellik / kural / fiyata dahil adları → getContentMany(...)
       (hiçbir aktif dilde yoksa öğe gizlenir)
     • robots: villa.noindex → noindex,nofollow (her dilde); hiç içerik
       yok → noindex,follow; aksi halde kök layout politikası.
     • JSON-LD URL'leri sayfanın dile göre kanonik yolunu kullanır.
   DEĞİŞMEYEN: fiyat, indirim, takvim/müsaitlik, harici rezervasyon,
   galeri ve sırası, kapasite, mesafe değerleri + ikonları (ikon anahtarı
   ORİJİNAL mesafe başlığından), ilişki sorguları, villa adı (özel
   isim), bölge adı (özel isim), yorumlar, gövde bileşeni.
   =============================================================== */

/** MobileBookingCta `targetId` eşleşmesi (eski modüllerle aynı id'ler). */
const BOOKING_SIDEBAR_ID: Record<Locale, string> = {
  tr: "booking-sidebar",
  en: "booking-sidebar-en",
  de: "booking-sidebar-de",
};

/* generateMetadata + sayfa aynı istekte → tek villa sorgusu. */
const getVillaBySlugCached = cache((slug: string) => getVillaBySlug(slug));

function villaPath(technicalKey: string, locale: Locale): string {
  /* Teknik anahtar → dilin slug'ı + segmenti (routing bağlamı). */
  return buildLocaleAlternates(`/kiralik-villa/${technicalKey}`, locale).canonical;
}

export async function villaRouteMetadata({ locale, params }: LocaleRouteProps): Promise<Metadata> {
  const slug = params.slug;
  const villa = await getVillaBySlugCached(slug);
  const dict = getDictionary(locale);

  if (!villa) {
    return { title: dict.villa.notFoundTitle, robots: { index: false, follow: false } };
  }

  const detail = await loadVillaDetailContent(publicContentReader, String(villa.id), locale);
  /* Villa ADI çevrilmez (özel isim); SEO başlığı merkezi içerikten. */
  const title = detail.seoTitle || villa.title || "Villa";
  const description = detail.seoDescription;
  const robots = villaRobots(detail.content, villa.noindex);

  const cover = villa.images && villa.images.length > 0 ? villa.images[0] : undefined;

  const settings = await getCachedSettings().catch(() => null);
  const { canonical, languages } = buildLocaleAlternates(
    `/kiralik-villa/${villa.slug || slug}`,
    locale
  );

  return {
    title,
    description,
    ...(robots ? { robots } : {}),
    /* 🌐 Faz 6 Dalga 5 — hiçbir aktif dilde içerik yoksa (noindex,follow)
       hreflang basılmaz (sitemap'te de yok; blog/CMS ile aynı ilke).
       Kayıt noindex bayrağında hreflang davranışı DEĞİŞMEDİ. */
    alternates: pickSeoAlternates(
      settings,
      canonical,
      languages,
      hasNoContentAnywhere(detail.content) ? { available: [], locale } : {}
    ),
    openGraph: {
      title,
      description,
      type: "website",
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

export async function VillaRoutePage({ locale, params, searchParams }: LocaleRouteProps) {
  const slug = params.slug;
  const dict = getDictionary(locale);

  /* DATE CONTINUITY — /arama → detay geçişinde taşınan tarihler. */
  const sp = searchParams ? await searchParams : {};
  const rawStart = Array.isArray(sp?.start) ? sp.start[0] : sp?.start;
  const rawEnd = Array.isArray(sp?.end) ? sp.end[0] : sp?.end;
  const initialStart = isValidYmd(rawStart) ? rawStart : null;
  const initialEnd = isValidYmd(rawEnd) ? rawEnd : null;
  const hasInitialRange = !!initialStart && !!initialEnd && initialStart < initialEnd;

  const villa = await getVillaBySlugCached(slug);
  if (!villa) {
    return (
      <section className="section-narrow py-32 text-center">
        <p className="eyebrow !text-[var(--color-stone-400)]">404</p>
        <h2 className="font-display text-3xl text-[var(--color-stone-900)] mt-3">
          {dict.villa.notFoundTitle}
        </h2>
        <p className="text-[var(--color-stone-500)] mt-3">{dict.villa.notFoundBody}</p>
        <a href={localeHref("/arama", locale)} className="btn-ghost mt-6 inline-flex">
          {dict.villa.notFoundCta}
        </a>
      </section>
    );
  }

  const youtubeVideos: VillaYouTubeVideo[] = normalizeYouTubeVideos(villa.youtube_videos);
  const villaId = String(villa.id);

  const [
    images,
    prices,
    discounts,
    distances,
    features,
    rules,
    priceIncludes,
    externalBlocks,
    settings,
    reviews,
    reviewStats,
    detail,
  ] = await Promise.all([
    getVillaImages(villa.id),
    getVillaPrices(villa.id),
    getVillaDiscounts(villa.id),
    getVillaDistances(villa.id),
    getVillaFeaturesByVilla(villa.id) as Promise<Feature[]>,
    getRuleItemsByVilla(villa.id),
    getPriceIncludeItemsByVilla(villa.id),
    fetchExternalCalendarStringsForVilla(villa.id).catch(() => EMPTY_EXTERNAL_STRING_ARRAYS),
    getCachedSettings(),
    getCachedVillaReviews(villa.id),
    getCachedVillaReviewStats(villa.id),
    loadVillaDetailContent(publicContentReader, villaId, locale),
  ]);

  /* Koleksiyon başına TEK merkezi okuma (N+1 yok). İlişki sorguları
     yukarıda AYNEN; yalnız görünen etiketler merkezi servisten. */
  const [featureNames, ruleTitles, includeTitles] = await Promise.all([
    loadContentLabels(publicContentReader, "villa_feature", "name", features.map((f) => f.id), locale),
    loadContentLabels(publicContentReader, "rule_item", "title", rules.map((r) => r.id), locale),
    loadContentLabels(
      publicContentReader,
      "price_include_item",
      "title",
      priceIncludes.map((p) => p.id),
      locale
    ),
  ]);

  /* Mesafe başlıkları statik sözlükten (DB içeriği değil); değer ve
     ikon anahtarı (ORİJİNAL başlıktan) değişmez. */
  const displayDistances: TranslatedDistance[] = distances.map((d) => ({
    id: d.id,
    displayTitle: getTranslatedDistanceLabel(d.title, locale),
    displayDistance: d.distance,
    iconKey: getDistanceIconKey(d.title),
  }));
  const displayFeatures: TranslatedFeature[] = labelItems(features, featureNames, (f, name) => ({
    id: f.id,
    displayName: name,
  }));
  const displayRules: TranslatedRule[] = labelItems(rules, ruleTitles, (r, title) => ({
    id: r.id,
    displayTitle: title,
  }));
  const displayPriceIncludes: TranslatedPriceInclude[] = labelItems(
    priceIncludes,
    includeTitles,
    (p, title) => ({ id: p.id, displayTitle: title })
  );

  /* Villa adı ve bölge adı özel isim → her dilde aynı. */
  const title = villa.title;
  const locationName = villa.location;
  const description = detail.description;

  const watermark = {
    logo: resolveAssetUrlVersioned(settings?.watermark_logo, settings?.updated_at) ?? null,
    enabled: settings?.watermark_enabled ?? false,
    opacity: settings?.watermark_opacity ?? 0.15,
    position: settings?.watermark_position ?? "center",
    size: settings?.watermark_size ?? 25,
  } as const;

  const imageUrls = images
    .map((img) => resolveVillaImageUrl(img.image_url))
    .filter((u): u is string => typeof u === "string" && u.length > 0);

  const minPrice = prices?.length
    ? prices.reduce(
        (acc, p) =>
          p.price > 0 && (acc === null || p.price < acc.price)
            ? { price: Number(p.price), currency: p.currency || "TRY" }
            : acc,
        null as { price: number; currency: string } | null
      )
    : null;

  const technicalKey = villa.slug || slug;
  const vacationRentalLd = buildVacationRental({
    slug: technicalKey,
    path: villaPath(technicalKey, locale),
    title,
    description: stripHtml(description ?? ""),
    images: imageUrls,
    locationName: locationName || null,
    latitude: typeof villa.latitude === "number" ? villa.latitude : null,
    longitude: typeof villa.longitude === "number" ? villa.longitude : null,
    guests: villa.guests,
    bedrooms: villa.bedrooms,
    bathrooms: villa.bathrooms,
    features: displayFeatures.map((f) => f.displayName).filter(Boolean),
    priceFrom: minPrice ? { amount: minPrice.price, currency: minPrice.currency } : null,
    aggregateRating:
      reviewStats.count > 0
        ? { ratingValue: reviewStats.average, reviewCount: reviewStats.count }
        : null,
    locale,
  });

  const breadcrumbLd = buildBreadcrumb(
    [
      { name: dict.villasArchive.breadcrumbHome, url: localeHref("/", locale) },
      /* robots-engelli arama yerine indexlenebilir arşiv. */
      { name: dict.header.villas, url: localeHref("/kiralik-villalar", locale) },
      { name: title },
    ],
    locale
  );

  return (
    <VillaDetailBody
      locale={locale}
      villa={villa}
      villaTitle={title}
      displayLocation={locationName}
      displayDescription={description}
      imageUrls={imageUrls}
      watermark={watermark}
      youtubeVideos={youtubeVideos}
      prices={prices}
      discounts={discounts}
      externalBlocks={externalBlocks}
      distances={displayDistances}
      features={displayFeatures}
      rules={displayRules}
      priceIncludes={displayPriceIncludes}
      reviews={reviews}
      reviewStats={reviewStats}
      orphanGapRuleEnabled={settings?.orphan_gap_rule_enabled ?? true}
      contactPhone={settings?.phone ?? null}
      contactWhatsappLink={settings?.whatsapp_link ?? null}
      initialStart={hasInitialRange ? initialStart : undefined}
      initialEnd={hasInitialRange ? initialEnd : undefined}
      bookingSidebarId={BOOKING_SIDEBAR_ID[locale]}
      vacationRentalLd={vacationRentalLd}
      breadcrumbLd={breadcrumbLd}
    />
  );
}

/** Dispatcher'a verilen tek modül (Faz 6 Dalga 2). */
export const villaRouteModule: UnifiedLocalePageModule = {
  Page: VillaRoutePage,
  generateMetadata: villaRouteMetadata,
};
