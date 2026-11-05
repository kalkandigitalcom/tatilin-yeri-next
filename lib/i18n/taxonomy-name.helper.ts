import type { Locale } from "@/lib/i18n/config";

/* ===============================================================
   🛡️ PHASE 10H — TAXONOMY (VİLLA TİPİ) ADI LOCALE ÇÖZÜCÜSÜ
   ===============================================================
   SAF (pure) helper — DB/server bağımlılığı YOK, bu yüzden client
   component'ler (Header.tsx / Footer.tsx) de güvenle import edebilir.

   NEDEN `nameByLocale` (locale'e göre TEK değer değil):
     Header ve Footer, projenin mevcut mimarisinde CLIENT component'tir
     ve aktif locale'i `usePathname()` + `localeFromPathname()` ile
     RENDER sırasında türetir (bkz. Header.tsx / Footer.tsx, Phase 9A/9B).
     Server wrapper'lar (`HeaderWrapper`/`FooterWrapper`) `headers()`/
     `cookies()` KULLANMAZ — bu, `(public)/layout.tsx`'in statik/ISR
     uygunluğunu korumak için BİLİNÇLİ bir tasarım kararıdır
     (bkz. FooterWrapper.tsx dosya başı yorumu). Dolayısıyla wrapper
     fetch anında locale BİLİNMEZ; çeviriler locale'den BAĞIMSIZ olarak
     (en + de birlikte) okunup client'a taşınır, seçim render'da yapılır.
     Bu, dictionary'nin (getDictionary(locale)) aynı dosyalarda zaten
     uyguladığı desenin DB-backed karşılığıdır.

   FALLBACK: `resolveTranslatedField` (lib/i18n/get-translation.server.ts)
   ile AYNI ilke — çeviri yok/boş/whitespace ise canonical TR değeri.
   YENİ bir fallback mantığı İCAT EDİLMEDİ.

   ⚠️ Yalnız GÖRÜNEN AD içindir. Slug/href/token üretimi bu helper'a
   HİÇ girmez — villa tipi slug'ı locale-bağımsız canonical kalır.
   =============================================================== */

/** Çevrilebilir locale'ler — TR canonical kaynak olduğu için hariç. */
export type TranslatableLocale = Exclude<Locale, "tr">;

/** Bir taxonomy kaydının locale → çevrilmiş ad haritası (kısmi). */
/** 🌐 Faz 6 Dalga 4 — `tr` anahtarı OPSİYONEL: yalnız merkezi okumayla
 *  (public-shared-content `loadLabelMapsByLocale`) üretilen haritalarda
 *  bulunur; eski EN/DE okuyucuları onu hiç üretmez. */
export type TaxonomyNameByLocale = Partial<Record<Locale, string>>;

/**
 * Görünen taxonomy adını locale'e göre çözer.
 *
 *   resolveTaxonomyName("Balayı Villası", { en: "Honeymoon Villa" }, "en")
 *     → "Honeymoon Villa"
 *   resolveTaxonomyName("Balayı Villası", { en: "Honeymoon Villa" }, "de")
 *     → "Balayı Villası"   (DE çevirisi yok → TR fallback)
 *   resolveTaxonomyName("Balayı Villası", undefined, "tr")
 *     → "Balayı Villası"   (TR canonical — hiçbir zaman çevrilmez)
 */
export function resolveTaxonomyName(
  canonicalName: string,
  nameByLocale: TaxonomyNameByLocale | null | undefined,
  locale: Locale
): string {
  /* TR: haritada `tr` yoksa (eski okuyucular) canonical AYNEN — eski
     davranış birebir. 🌐 Faz 6 Dalga 4: merkezi haritada `tr` varsa o
     (ana dil TR değilken TR etiketi de merkezi zincirle çözülür). */
  if (locale === "tr") {
    const tr = nameByLocale?.tr;
    return typeof tr === "string" && tr.trim() !== "" ? tr : canonicalName;
  }

  const translated = nameByLocale?.[locale];
  if (typeof translated === "string" && translated.trim() !== "") {
    return translated;
  }
  return canonicalName;
}
