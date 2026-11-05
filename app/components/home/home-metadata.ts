import "server-only";

import type { Metadata } from "next";

import { getCachedSettings } from "@/lib/cache.helpers";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { buildLocaleAlternates, pickSeoAlternates } from "@/lib/i18n/seo-alternates";
import { resolvePublicHome } from "@/lib/i18n/public-home";
import { getPublicSettingsTexts } from "@/lib/i18n/content/public-shared-content.server";
import { publicLocaleCtxFromSettings } from "@/lib/i18n/content/public-shared-content";
import { getDictionary } from "@/lib/i18n/get-dictionary";

/* ===============================================================
   🛡️ PHASE 11 — ANA SAYFA METADATA (TR / EN / DE ORTAK)
   ===============================================================
   TR sayfası daha önce YALNIZ statik `metadata = { alternates:
   { canonical: "/" } }` export ediyordu; title/description root
   layout'tan miras kalıyordu. Artık üç locale de kendi
   `generateMetadata`'sını bu TEK helper üzerinden üretir.

   NEDEN SAYFA SEVİYESİ (root layout DEĞİL):
     `app/layout.tsx > generateMetadata` request locale'ini GÜVENLE
     OKUYAMAZ (Phase 7E; regresyon kilidi tests/unit/html-lang-layout.
     test.ts). Ana sayfada bu engel YOKTUR — `/en/page.tsx` locale'i
     YAPI GEREĞİ bilir. Root layout'a DOKUNULMADI; `<html lang="tr">`
     mimari kararı DEĞİŞMEDİ.

   ÜRETİLEN:
     • canonical  : "/" | "/en" | "/de"
     • languages  : tr/en/de/x-default (buildLocaleAlternates, Phase 7B)
     • title/desc : settings.default_meta_* → settings_translations
                    (Phase 10L) → yoksa TR canonical
     • openGraph/twitter: aynı başlık/açıklama (root'un OG görseli
       miras kalır — görsel DİL BAĞIMSIZ).

   ⚠️ `robots` BURADA SET EDİLMEZ — root layout'un
   `settings.robots_index/robots_follow` politikası miras alınır.
   (EN/DE placeholder'larındaki koşulsuz `noindex` Phase 11'de
   KALDIRILDI; ana sayfalar artık gerçek içerik.)
   =============================================================== */

/* 🌐 Faz 6 Dalga 4 (son düzeltme) — sabit Türkçe yedek metin kaldırıldı.
   `default_meta_*` hiçbir aktif dilde yoksa yedek, ANA DİLİN sözlüğünden
   (`home.seo.metaTitleFallback` / `metaDescriptionFallback`) gelir:
   ana dil TR → Türkçe (eski sabitlerle birebir), EN → İngilizce, DE →
   Almanca. Ana dil daima aktiftir; pasif dil hiçbir adımda kullanılmaz.
   Ayar okunamazsa varsayılan bağlam (ana dil TR) → Türkçe (eskisi gibi). */

export async function buildHomeMetadata(
  locale: Locale = DEFAULT_LOCALE
): Promise<Metadata> {
  const settings = await getCachedSettings().catch(() => null);
  /* 🌐 Faz 6 Dalga 4 — meta başlık/açıklama merkezi servisten (tekil
     kayıt kuralı). Ana dil TR iken eski `resolveSettingsText` ile birebir. */
  const texts = await getPublicSettingsTexts(locale);

  const fallback = getDictionary(publicLocaleCtxFromSettings(settings).root).home.seo;

  const title = texts.default_meta_title?.trim() || fallback.metaTitleFallback;

  const description =
    texts.default_meta_description?.trim() || fallback.metaDescriptionFallback;

  const { canonical, languages } = buildLocaleAlternates("/", locale);

  /* 🔄 ANA SAYFAYA ÖZEL hreflang/canonical DÜZELTMESİ
     ------------------------------------------------------------
     `buildLocaleAlternates` SAF ve settings'ten habersizdir
     (`localeHref` de onu kullanır) — bu yüzden DEĞİŞTİRİLMEDİ.
     Ana sayfaya özel tek istisna BURADA, yalnız bu helper'da
     uygulanır:

       MOD A (varsayılan "tr" veya multilingual kapalı)
         → hiçbir şey değişmez; çıktı BYTE-IDENTICAL.
       MOD B (varsayılan "en"/"de")
         → `/` bir yönlendiricidir; TR ana sayfa `/tr`'de yaşar.
           `hreflang="tr"` ve TR canonical `/tr`'yi gösterir,
           `x-default` ise varsayılan dilin ana sayfasını gösterir.
           Böylece hiçbir hreflang hedefi redirect'e düşmez.

     Ek DB/cache okuması YOK — `settings` yukarıda ZATEN okundu. */
  const home = resolvePublicHome(settings);
  const homeLanguages = home.redirectsFromRoot
    ? {
        ...languages,
        tr: home.trHomeHref,
        "x-default": languages[home.defaultLocale],
      }
    : languages;
  const homeCanonical = home.redirectsFromRoot
    ? homeLanguages[locale]
    : canonical;

  return {
    title,
    description,
    alternates: pickSeoAlternates(settings, homeCanonical, homeLanguages),
    openGraph: { title, description },
    twitter: { title, description },
  };
}
