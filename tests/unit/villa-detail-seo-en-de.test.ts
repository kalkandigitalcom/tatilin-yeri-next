/* ===============================================================
   🛡️ PHASE 7C / 8C — EN/DE VILLA DETAIL generateMetadata:
   CANONICAL + HREFLANG (7C) + SEO_DESCRIPTION (8C)
   ===============================================================
   Hedef:
     (🌐 Faz 6 Dalga 2) tek villa route modülü
     app/(public)/_routes/villa.tsx > villaRouteMetadata (locale "en" | "de").
     Eski EN/DE modülleri eşdeğerlik testinden sonra kaldırıldı; çeviri
     okuyucuları (get-villa-translation.server) yerine MERKEZİ servis.

   Mock seviyesi Phase 6B/locale-routes.test.tsx ile AYNI desen:
   `@/lib/i18n/public-locale-gate.server`, `@/app/services/villa.service`,
   `@/lib/i18n/get-villa-translation.server`, `@/lib/cache.helpers`
   mock'lanır (hiçbiri bu fazda GERÇEKTEN değiştirilmedi). `buildLocaleAlternates`
   (Phase 7B) mock'lanmıyor — gerçek implementasyonuyla çalışıyor.

   🛡️ PHASE 8C EKLEMESİ: `getVillaTranslatedSeoDescription` de AYNI
   mock factory'ye eklendi (mock'lanmazsa page.tsx'in yeni import'u
   `undefined` alır ve generateMetadata çağrısında TypeError fırlatır
   — Phase 8B'nin locale-routes.test.tsx'te uyguladığı AYNI zorunlu
   düzeltme). canonical/hreflang/robots testleri DEĞİŞMEDİ — yalnız
   eski "description metadata'da SET EDİLMEZ" testi, artık description'ın
   set EDİLDİĞİ yeni Phase 8C davranışına göre güncellendi.

   GERÇEK DB'YE HİÇ DOKUNULMAZ.
   =============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { contentTables, resetContentTables } from "../fixtures/faz6/content-table-mock";

const getVillaBySlugMock = vi.fn();
const getCachedSettingsMock = vi.fn();
const contentSpy = vi.fn();

vi.mock("@/app/services/villa.service", () => ({
  getVillaBySlug: (...args: unknown[]) => getVillaBySlugMock(...args),
}));
vi.mock("@/lib/i18n/content/content-read.server", async () =>
  (await import("../fixtures/faz6/content-table-mock")).contentReadServerMock((...a) => contentSpy(...a))
);
vi.mock("@/lib/cache.helpers", () => ({
  getCachedSettings: (...args: unknown[]) => getCachedSettingsMock(...args),
}));

beforeEach(() => {
  resetContentTables();
  contentSpy.mockReset();
  getVillaBySlugMock.mockReset();
  getCachedSettingsMock.mockReset();
});

const BASE_VILLA = {
  id: "villa-uuid-1",
  slug: "villa-in-love",
  title: "Villa Aşkım",
  /* 🛡️ PHASE 8C — generateMetadata artık bunları
     getVillaTranslatedSeoDescription'a geçiriyor (mock'landığı için
     GERÇEK excerpt/fallback mantığı burada çalışmıyor — yalnız
     doğru argümanlarla çağrıldığı doğrulanıyor). */
  seo_description: "Orijinal TR seo açıklaması.",
  description: "<p>Orijinal TR açıklaması.</p>",
};

const ROUTES: Array<{
  modulePath: string;
  locale: "en" | "de";
  notFoundTitle: string;
}> = [
  { modulePath: "villaRouteMetadata(en)", locale: "en", notFoundTitle: "Villa not found" },
  { modulePath: "villaRouteMetadata(de)", locale: "de", notFoundTitle: "Villa nicht gefunden" },
];

/** Villa'yı sahte servise; TR satırı (ayna) + istenen dilin satırını merkezi tabloya yazar. */
function useVilla(v: typeof BASE_VILLA | null, own?: Record<string, string | null>, locale = "en") {
  getVillaBySlugMock.mockResolvedValue(v);
  if (v) {
    contentTables.villa = {
      [v.id]: {
        tr: { description: v.description, seo_title: null, seo_description: v.seo_description },
        ...(own ? { [locale]: own } : {}),
      },
    };
  }
}

async function callGenerateMetadata(modulePath: string, slug = "villa-in-love") {
  const locale = modulePath.includes("(de)") ? "de" : "en";
  const { villaRouteMetadata } = await import("@/app/(public)/_routes/villa");
  return villaRouteMetadata({ locale, params: { slug }, searchParams: Promise.resolve({}) });
}

describe.each(ROUTES)(
  "$modulePath generateMetadata — Phase 7C canonical/hreflang",
  ({ modulePath, locale, notFoundTitle }) => {
    /* --- 2/3) EN/DE locale canonical --- */
    it(`canonical '/${locale}/kiralik-villa/{slug}' formatındadır`, async () => {
      getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: false });
      useVilla(BASE_VILLA);

      const result = await callGenerateMetadata(modulePath);
      expect(result.alternates?.canonical).toBe(
        `/${locale}/villa/villa-in-love`
      );
    });

    /* --- 4) multilingual_enabled=true iken dört hreflang key'i --- */
    it("multilingual_enabled=true iken languages tr/en/de/x-default TAMAMI mevcut", async () => {
      getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: true });
      useVilla(BASE_VILLA);

      const result = await callGenerateMetadata(modulePath);
      const languages = result.alternates?.languages as
        | Record<string, unknown>
        | undefined;
      expect(languages?.tr).toBe("/kiralik-villa/villa-in-love");
      expect(languages?.en).toBe("/en/villa/villa-in-love");
      expect(languages?.de).toBe("/de/villa/villa-in-love");
      expect(languages?.["x-default"]).toBe("/kiralik-villa/villa-in-love");
    });

    /* --- 5) x-default TR --- */
    it("x-default HER ZAMAN TR path'tir", async () => {
      getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: true });
      useVilla(BASE_VILLA);

      const result = await callGenerateMetadata(modulePath);
      const languages = result.alternates?.languages as
        | Record<string, unknown>
        | undefined;
      expect(languages?.["x-default"]).toBe("/kiralik-villa/villa-in-love");
    });

    /* --- 6) multilingual_enabled=false iken EN/DE hreflang'ların
       YANLIŞLIKLA 404 URL olarak üretilmemesi --- */
    it("multilingual_enabled=false iken `languages` key'i HİÇ YOK", async () => {
      getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: false });
      useVilla(BASE_VILLA);

      const result = await callGenerateMetadata(modulePath);
      expect(result.alternates).toEqual({
        canonical: `/${locale}/villa/villa-in-love`,
      });
      expect(
        (result.alternates as Record<string, unknown>).languages
      ).toBeUndefined();
    });

    /* --- 7) 🛡️ PUBLIC ÇOKLU DİL TAMAMLAMA — KOŞULSUZ `noindex`
       KALDIRILDI. Bu override Phase 4A/6B/7C'nin geçici
       `LocaleRouteComingSoon` placeholder'ından kalmıştı; sayfa Phase
       10B'den beri TR ile AYNI, tam çevrilmiş gerçek içeriği render
       ediyor ve sitemap bu URL'leri hreflang alternate olarak veriyor.
       Index politikası artık root layout'un
       `settings.robots_index/robots_follow` ayarından MİRAS alınır;
       `multilingual_enabled=false` iken route zaten 404 döner.
       ⚠️ Villa BULUNAMADIĞINDA dönen noindex DEĞİŞMEDİ (aşağıdaki
       test). --- */
    it("robots override YOK — flag kapalıyken de root politikası miras alınır", async () => {
      getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: false });
      useVilla(BASE_VILLA);

      const result = await callGenerateMetadata(modulePath);
      expect(result.robots).toBeUndefined();
    });

    it("robots override YOK — flag açıkken de (hreflang ile tutarlı)", async () => {
      getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: true });
      useVilla(BASE_VILLA);

      const result = await callGenerateMetadata(modulePath);
      expect(result.robots).toBeUndefined();
    });

    it("villa bulunamazsa (null) → notFound title + noindex, alternates YOK", async () => {
      getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: true });
      useVilla(null);

      const result = await callGenerateMetadata(modulePath, "olmayan-slug");
      expect(result.title).toBe(notFoundTitle);
      expect(result.robots).toEqual({ index: false, follow: false });
      expect(result.alternates).toBeUndefined();
    });

    /* --- 🛡️ VİLLA ADI ÇEVRİLMEZ: metadata title'ı canonical
       `villa.title`'dan gelir (seo_title çevirisi varsa o önceliklidir —
       ayrı testte doğrulanıyor). --- */
    it("title canonical villa.title'dan gelir (çeviri helper'ı YOK)", async () => {
      getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: false });
      useVilla(BASE_VILLA);

      const result = await callGenerateMetadata(modulePath);
      expect(result.title).toBe(BASE_VILLA.title);
    });

    /* --- 🛡️ PHASE 8C — description artık getVillaTranslatedSeoDescription'dan
       set ediliyor (eski "SET EDİLMEZ" beklentisi Phase 7C'ye özgüydü,
       Phase 8C audit raporunun onayladığı tek adımla güncellendi). --- */
    it("description: istenen dilin seo_description'ı (merkezi servis, tek okuma)", async () => {
      getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: false });
      useVilla(BASE_VILLA, { description: "<p>Own text.</p>", seo_description: `Translated ${locale} SEO description.` }, locale);

      const result = await callGenerateMetadata(modulePath);
      expect(result.description).toBe(`Translated ${locale} SEO description.`);
      expect(contentSpy).toHaveBeenCalledWith("villa", [BASE_VILLA.id], locale);
    });

    it("description: istenen dilde seo_description yoksa İSTENEN DİLDEKİ açıklamanın özeti (başka dilin seo_description'ı geçmez)", async () => {
      getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: false });
      useVilla(BASE_VILLA, { description: "<p>Own locale text.</p>", seo_description: null }, locale);

      const result = await callGenerateMetadata(modulePath);
      expect(result.description).toBe("Own locale text.");
    });

    it("description: istenen dilde hiç satır yoksa ana dil zinciri (ana dil TR)", async () => {
      getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: false });
      useVilla(BASE_VILLA);

      const result = await callGenerateMetadata(modulePath);
      /* Yedek dilin seo_description'ı istenen dile GEÇMEZ (Faz 3.1); yedek
         açıklamanın özeti — eski getVillaTranslatedSeoDescription ile aynı sonuç. */
      expect(result.description).toBe("Orijinal TR açıklaması.");
      expect(result.robots).toBeUndefined();
    });

    it("seo_title istenen dilde varsa başlık o; villa adı çevrilmez", async () => {
      getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: false });
      useVilla(BASE_VILLA, { seo_title: `SEO ${locale}`, description: "<p>x</p>" }, locale);

      const result = await callGenerateMetadata(modulePath);
      expect(result.title).toBe(`SEO ${locale}`);
    });

    it("openGraph.description ve twitter artık TR ile AYNI biçimde (🌐 Faz 6 Dalga 2 tek modül — bilinçli ekleme)", async () => {
      getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: false });
      useVilla(BASE_VILLA, { description: "<p>x</p>", seo_description: `Translated ${locale} SEO description.` }, locale);

      const result = await callGenerateMetadata(modulePath);
      expect((result.openGraph as Record<string, unknown>).description).toBe(`Translated ${locale} SEO description.`);
      expect((result as Record<string, unknown>).twitter).toEqual({
        card: "summary",
        title: BASE_VILLA.title,
        description: `Translated ${locale} SEO description.`,
      });
    });

    it("villa bulunamazsa (null) → merkezi içerik HİÇ OKUNMAZ", async () => {
      getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: true });
      useVilla(null);

      await callGenerateMetadata(modulePath, "olmayan-slug");
      expect(contentSpy).not.toHaveBeenCalled();
    });

    it("openGraph.url canonical ile AYNI", async () => {
      getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: false });
      useVilla(BASE_VILLA);

      const result = await callGenerateMetadata(modulePath);
      expect(result.openGraph?.url).toBe(result.alternates?.canonical);
    });
  }
);
