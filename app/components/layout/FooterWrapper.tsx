import Footer from "./Footer";

/* 🔄 CACHE KULLANIMI — `getPublicSettings()` doğrudan çağrılıyordu;
   `getCachedSettings` ZATEN bu fonksiyonun `unstable_cache`
   sarmalayıcısı (lib/cache.helpers.ts). Dönen veri/tip/null
   davranışı BİREBİR aynı; tag "settings", invalidation
   `revalidateSettings()` ile AYNEN çalışıyor. Header ile birlikte
   aynı request içindeki İKİ ayrı settings sorgusu ortadan kalkar.

   ⚠️ `menuRepository.findAllVillaLocations/Types` BİLİNÇLİ OLARAK
   DEĞİŞTİRİLMEDİ: `getCachedVillaLocations/Types` FARKLI bir sorgu
   çalıştırıyor (`findAllForTaxonomy` → ORDER BY name; `findAllBySortOrder`
   → ORDER BY sort_order). Buradaki çağrıların ORDER BY'ı YOK ve sonuç
   `.slice(0, 7)` ile kırpılıyor → swap footer'da GÖRÜNEN 7 bölge/tipi
   değiştirirdi. Davranış korunuyor. */
import { getCachedSettings } from "@/lib/cache.helpers";
import { ADMIN_BRANDING_PATHS, getAdminLogoUrl } from "@/lib/admin-branding";
import { getSiteAssetVersion } from "@/lib/storage/site-asset-version.server";
import type { Settings } from "@/app/services/settings.types";
import { menuRepository } from "@/lib/db/menu.repository";
import { pagesRepository } from "@/lib/db/pages.repository";
/* 🛡️ PHASE 10H — villa tipi adlarının EN/DE karşılıkları (migration 082,
   `villa_type_translations`). Locale'den BAĞIMSIZ okunur; seçim client
   tarafta (`Footer.tsx`, `usePathname()` locale'i) yapılır — bu wrapper
   `headers()`/`cookies()` KULLANMAMAYA devam eder, yani layout'un
   statik/ISR uygunluğu DEĞİŞMEZ. */
import type { Locale } from "@/lib/i18n/config";
/* 🛡️ CMS SAYFA BAŞLIKLARI — "Kurumsal" linklerinin adı `pages.title`'dan
   gelir; EN/DE karşılıkları migration 082'deki `page_translations.title`.
   Villa tipi çevirisiyle AYNI batch deseni (locale başına TEK `.in()`
   sorgusu, N+1 YOK) ve AYNI wrapper sözleşmesi: locale'den BAĞIMSIZ
   okunur, seçim `Footer.tsx` (client) içinde yapılır. */
/* 🌐 Faz 6 Dalga 4 — kategori adı, kurumsal sayfa başlığı ve telif metni
   merkezi okuma servisinden (her AKTİF dil için, TR dahil; seçim yine
   istemcide). Hiçbir aktif dilde etiketi olmayan öğe GİZLENİR. */
import {
  loadLabelMapsByLocale,
  publicLocaleCtxFromSettings,
} from "@/lib/i18n/content/public-shared-content";
import { getPublicSettingsTextsByLocale } from "@/lib/i18n/content/public-shared-content.server";
import { publicContentReader } from "@/lib/i18n/content/public-villa-content.server";
import type { TaxonomyNameByLocale } from "@/lib/i18n/taxonomy-name.helper";

/* ---------------- DYNAMIC TAXONOMY ITEMS ---------------- */

export type TaxonomyItem = {
  id: string;
  name: string;
  slug: string | null;
  /** 🛡️ PHASE 10H — OPSİYONEL. Yalnız villa tipleri için doldurulur;
   *  bölgeler (locations) bu fazın kapsamı DIŞINDA, undefined kalır →
   *  `resolveTaxonomyName` canonical TR adına düşer (eski davranış). */
  nameByLocale?: TaxonomyNameByLocale;
  /** 🛡️ SEO landing — yalnız bölgelerde dolu (menuRepository
   *  `findAllVillaLocations` SELECT'i ZATEN getiriyor); grup kökü
   *  tespiti için okunur. Tip ekidir, veri akışı DEĞİŞMEDİ. */
  filter_group_name?: string | null;
};

/* ---------------- KURUMSAL — CMS-DRIVEN ----------------
   Veri kaynağı: `pagesRepository.findActivePages()` (slim).
   Header (`getMenu()`) ile AYRI kanal:
     • Header  : is_active=true VE show_in_menu=true (mevcut)
     • Footer  : is_active=true (show_in_menu YOK)
   Admin "Menüde Göster" sadece header navigation'ı kontrol eder.
   Yayında olan her sayfa otomatik footer Kurumsal'da görünür.
   Sıralama: menu_order ASC nulls-last, sonra created_at ASC.
---------------------------------------------------------- */
export type CorporatePage = {
  id: string;
  title: string;
  slug: string;
  menu_order?: number | null;
  created_at?: string | null;
  /** 🛡️ OPSİYONEL — `page_translations.title` (EN/DE). Yoksa/boşsa
   *  `resolveTaxonomyName` canonical TR `title`'a düşer (eski davranış).
   *  ⚠️ `slug` ÇEVRİLMEZ; link `/p/{slug}` AYNEN kalır. */
  nameByLocale?: TaxonomyNameByLocale;
};

/* ===================================================================
   🛡️ PHASE 9B — FOOTER SERVER DATA WRAPPER
   ===================================================================
   HeaderWrapper.tsx (async server) → Header.tsx (client) deseninin
   BİREBİR aynısı. Footer'ın DB/service veri-çekme mantığı (Phase 8'e
   kadar Footer.tsx içinde yaşıyordu) buraya, davranışı DEĞİŞTİRİLMEDEN
   taşındı: aynı Promise.allSettled sırası, aynı filtreleme/sıralama,
   aynı fallback'ler (bir fetch reject olursa diğerleri etkilenmez).

   Bu dosya `headers()`/`cookies()` KULLANMAZ — dolayısıyla bu wrapper'ın
   eklenmesi, `(public)/layout.tsx`'in statik/ISR rendering uygunluğunu
   HİÇ etkilemez (Phase 9 audit'inde doğrulanan risk, bu tasarımla
   tamamen ortadan kalkıyor). Locale tespiti artık `Footer.tsx` (client)
   içinde, Header'daki gibi `usePathname()` ile yapılıyor — bu wrapper
   locale'den tamamen bağımsız, saf veri katmanı.
=================================================================== */
export default async function FooterWrapper() {
  /* Dört paralel fetch — biri fail olursa diğeri etkilenmez.
     Promise.allSettled tüm sonuçları döner; reject olanlar null. */
  const [settingsRes, locsRes, typesRes, corpPagesRes] =
    await Promise.allSettled([
      getCachedSettings(),
      menuRepository.findAllVillaLocations(),
      menuRepository.findAllVillaTypes(),
      /* Footer'a özel slim helper — `findActivePages` (show_in_menu
         filtresi YOK). Header'ın `findActivePagesForMenu` helper'ı
         DOKUNULMADI; iki kanal birbirinden bağımsız. */
      pagesRepository.findActivePages(),
    ]);

  const settings: Settings | null =
    settingsRes.status === "fulfilled" ? settingsRes.value : null;

  const locations: TaxonomyItem[] =
    locsRes.status === "fulfilled" && Array.isArray(locsRes.value?.data)
      ? (locsRes.value.data as TaxonomyItem[])
          .filter((l) => l?.name)
          .slice(0, 7)
      : [];

  const villaTypesBase: TaxonomyItem[] =
    typesRes.status === "fulfilled" && Array.isArray(typesRes.value?.data)
      ? (typesRes.value.data as TaxonomyItem[]).filter((t) => t?.name)
      : [];

  /* 🌐 Faz 6 Dalga 4 — villa tipi adları merkezi servisten, AKTİF dil
     başına TEK batch (çoklu dil kapalıyken yalnız ana dil). Etiketi
     hiçbir aktif dilde olmayan tip gizlenir; 7'lik kırpma gizlemeden
     SONRA yapılır (görünen tip sayısı ve sırası eskisiyle aynı). */
  const { enabled } = publicLocaleCtxFromSettings(settings);
  const typeNamesByLocale: Record<string, TaxonomyNameByLocale> =
    await loadLabelMapsByLocale(
      publicContentReader,
      "villa_type",
      "name",
      villaTypesBase.map((t) => t.id),
      enabled
    );

  const villaTypes: TaxonomyItem[] = villaTypesBase
    .filter((t) => typeNamesByLocale[t.id])
    .slice(0, 7)
    .map((t) => ({ ...t, nameByLocale: typeNamesByLocale[t.id] }));

  /* Kurumsal CMS pages — filter + sort.
     Repo `is_active=true` filtreli; show_in_menu KASTEN filtrelenmez
     (footer header'dan ayrı kanal). slug + title sanity check.
     Sıralama: menu_order ASC nulls-last, sonra created_at ASC
     (deterministic tie-break). */
  const corporatePagesBase: CorporatePage[] =
    corpPagesRes.status === "fulfilled" &&
    Array.isArray(corpPagesRes.value?.data)
      ? (corpPagesRes.value.data as CorporatePage[])
          .filter(
            (p) =>
              typeof p?.slug === "string" &&
              p.slug.trim().length > 0 &&
              typeof p?.title === "string" &&
              p.title.trim().length > 0
          )
          .sort((a, b) => {
            const ao =
              typeof a.menu_order === "number"
                ? a.menu_order
                : Number.MAX_SAFE_INTEGER;
            const bo =
              typeof b.menu_order === "number"
                ? b.menu_order
                : Number.MAX_SAFE_INTEGER;
            if (ao !== bo) return ao - bo;
            const ac = a.created_at || "";
            const bc = b.created_at || "";
            return ac.localeCompare(bc);
          })
      : [];

  /* 🌐 Faz 6 Dalga 4 — kurumsal sayfa başlıkları merkezi servisten (aynı
     kural); hiçbir aktif dilde başlığı olmayan sayfa gizlenir. Sıralama
     ve filtreleme YUKARIDA tamamlandı. Telif metni: aktif dil başına
     tekil kayıt kuralı (istenen → ana dil satırı AYNEN → diğer aktifler). */
  const [pageTitlesByLocale, settingsTexts] = await Promise.all([
    loadLabelMapsByLocale(
      publicContentReader,
      "page",
      "title",
      corporatePagesBase.map((p) => p.id),
      enabled
    ),
    getPublicSettingsTextsByLocale(settings),
  ]);

  const corporatePages: CorporatePage[] = corporatePagesBase
    .filter((p) => pageTitlesByLocale[p.id])
    .map((p) => ({ ...p, nameByLocale: pageTitlesByLocale[p.id] }));

  const copyrightByLocale: Partial<Record<Locale, string | null>> = {};
  for (const [l, t] of Object.entries(settingsTexts)) {
    copyrightByLocale[l as Locale] = t?.footer_copyright ?? null;
  }

  const year = new Date().getFullYear();
  const siteName = settings?.site_name || "Villa Kiralama";
  const phoneDigits = settings?.phone?.replace(/[^\d]/g, "") || "";

  /* 🛡️ Geliştirici kredisi logosu = Admin → Webmaster → "Admin Logo"
     (site-assets/branding/admin-logo.webp; admin sidebar/giriş ile AYNI
     dosya, yeni ayar/upload YOK). Versiyon R2 ETag'i: logo yeniden
     yüklenince upload route'u etiketi geçersiz kılar → yeni `?ts=`
     URL'i, eski logo cache'ten gelmez. Dosya yok / R2'ye ulaşılamıyor
     → null → footer "KalkanDigital" metnini gösterir. */
  const developerCreditVersion = await getSiteAssetVersion(
    ADMIN_BRANDING_PATHS["admin-logo"]
  ).catch(() => null);
  const developerCreditLogoUrl = developerCreditVersion
    ? getAdminLogoUrl(developerCreditVersion) || null
    : null;

  return (
    <Footer
      settings={settings}
      locations={locations}
      villaTypes={villaTypes}
      corporatePages={corporatePages}
      year={year}
      siteName={siteName}
      phoneDigits={phoneDigits}
      developerCreditLogoUrl={developerCreditLogoUrl}
      copyrightByLocale={copyrightByLocale}
    />
  );
}
