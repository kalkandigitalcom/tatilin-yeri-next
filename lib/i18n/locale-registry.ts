import type { Locale } from "@/lib/i18n/config";

/* ===============================================================
   🌐 LOCALE REGISTRY — dil metadatası (Çok Dilli Mimari Faz 1)
   ===============================================================
   Kodda desteklenen her dilin SABİT metadatası. Yayın durumu
   (aktif/pasif) ve ana dil DB'dedir (`site_locales`, migration 101 +
   `settings.public_default_locale`); burada YALNIZ değişmeyen bilgi
   tutulur. Yeni bir dil eklemek: `Locale` tipine + SUPPORTED_LOCALES'e
   + sözlüğe + bu kayda eklenir, ardından `site_locales`'e satır girilir.

   `hreflang` ve `ogLocale` Faz 3 (SEO) çıktılarında kullanılacak;
   şimdilik admin arayüzü yalnız etiketleri okur.
   =============================================================== */

export type LocaleMeta = {
  /** Admin arayüzündeki Türkçe ad. */
  adminLabel: string;
  /** Dilin kendi adıyla gösterimi (dil seçici). */
  nativeLabel: string;
  /** hreflang değeri (BCP-47, bölgesiz). */
  hreflang: string;
  /** Open Graph locale (`og:locale`). */
  ogLocale: string;
};

export const LOCALE_META: Readonly<Record<Locale, LocaleMeta>> = {
  tr: { adminLabel: "Türkçe", nativeLabel: "Türkçe", hreflang: "tr", ogLocale: "tr_TR" },
  en: { adminLabel: "İngilizce", nativeLabel: "English", hreflang: "en", ogLocale: "en_US" },
  de: { adminLabel: "Almanca", nativeLabel: "Deutsch", hreflang: "de", ogLocale: "de_DE" },
};
