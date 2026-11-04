/* ===============================================================
   🛡️ SEO ALTERNATES — canonical + hreflang URL SETİ (PHASE 7B)
   ===============================================================
   Saf, framework'ten bağımsız bir path helper'ı: verilen bir path +
   hedef locale için canonical path'i VE tam hreflang (`languages`)
   kümesini üretir.

   BU DOSYA BİLİNÇLİ OLARAK HİÇBİR YERE BAĞLANMADI (Phase 7B kapsamı):
     - app/layout.tsx, app/(public)/kiralik-villa/[slug]/page.tsx,
       app/(public)/kiralik-villalar/page.tsx, app/sitemap.ts,
       app/robots.ts, app/components/seo/StructuredData.tsx,
       lib/seo.ts — HİÇBİRİ bu modülü import ETMİYOR/ETMEYECEK bu
       fazda. Bağlama (generateMetadata/sitemap entegrasyonu) Phase
       7C/7D+'nin konusu (bkz. Phase 7A audit raporu §13).
     - `multilingual_enabled` bayrağını KONTROL ETMEZ — bilinçli:
       bu saf bir URL-şekillendirme fonksiyonu, flag kontrolü ileride
       çağıran generateMetadata/sitemap call-site'larının sorumluluğu
       olacak (Phase 7A audit §4, §10).
     - Absolute URL ÜRETMEZ — yalnız relative path döner; absolute'a
       çözme mevcut `metadataBase` mekanizmasının işi (lib/seo.ts,
       app/layout.tsx) — ona dokunulmadı.

   URL STRATEJİSİ (Phase 4A'dan beri sabit, burada YENİDEN
   TANIMLANMADI, yalnız uygulanıyor):
     TR        → {path}       (prefix YOK — `/tr` HİÇBİR ZAMAN üretilmez)
     EN        → /en{path}
     DE        → /de{path}
     x-default → TR path (Phase 7A audit §4 gerekçesi: site bugün
                 fiilen TR-first, DEFAULT_LOCALE="tr")

   NORMALIZATION (bilinçli minimal — yeni bir proje convention'ı İCAT
   EDİLMEDİ):
     - path'in başına tek bir "/" garanti edilir — `app/sitemap.ts`'in
       kendi `url()` helper'ıyla (satır 74-83) AYNI desen:
       `path.startsWith("/") ? path : "/" + path`.
     - path zaten `/en` veya `/de` ile başlıyorsa (yalnız TAM segment
       eşleşmesi — `/en/...` veya tam `/en`) bu prefix önce soyulur,
       sonra hedef locale'e göre yeniden eklenir → çifte prefix
       (`/en/en/...`) OLUŞMAZ, fonksiyon idempotenttir. `/energy`,
       `/design` gibi path'ler YANLIŞLIKLA `/en`/`/de` prefix'i
       taşıyormuş gibi ALGILANMAZ (segment-sınırlı karşılaştırma).
     - Trailing slash / query string / hash STRIP EDİLMEZ, YORUMLANMAZ
       — path'in prefix sonrası kalan kısmı OPAK bir string olarak
       aynen taşınır (agresif normalization YOK).
     - `/tr` prefix'li bir input bu projede ZATEN oluşmaz (TR route'ları
       hiçbir zaman `/tr` taşımıyor — Phase 4A kararı); bu fonksiyon
       böyle bir input'u soymaya ÇALIŞMAZ (kapsam dışı, "icat etme"
       kuralına uyularak eklenmedi).

   Locale tipi Phase 1B'den (`lib/i18n/config.ts`) reuse edilir — burada
   YENİDEN TANIMLANMADI. `toLocale`/`SUPPORTED_LOCALES` de aynı şekilde
   reuse edilir (savunmacı validasyon için — bkz. `buildLocaleAlternates`).
   =============================================================== */

import {
  SUPPORTED_LOCALES,
  getEnabledPublicLocales,
  getRootLocale,
  toLocale,
  type Locale,
} from "@/lib/i18n/config";
import { getRoutingContext } from "@/lib/i18n/routing/context";
import { localizeHref } from "@/lib/i18n/routing/url";

export type LocaleAlternates = {
  /** Hedef `locale` için canonical path (relative, `/` ile başlar). */
  canonical: string;
  /** Next.js `Metadata.alternates.languages` ile birebir uyumlu şekil
   *  (`tr`/`en`/`de`/`x-default` key'leri). */
  languages: Record<Locale | "x-default", string>;
};

/** TR dışındaki, gerçekten URL prefix'i olan locale'ler. `SUPPORTED_LOCALES`
 *  (Phase 1B) üzerinden türetilir — yeni bir locale listesi İCAT EDİLMEDİ. */
/* 🌐 Çok Dilli Mimari Faz 2 — URL'ler artık merkezi route kaydından
   (lib/i18n/routing) üretilir: ana dil kökte, diğer diller önekli; yol
   segmentleri ve içerik slug'ları dile göre. `path` TR biçiminde (veya
   herhangi bir dilin public yolu) verilebilir; sonuç idempotenttir.
   x-default = ana dilin URL'si. */
export function buildLocaleAlternates(
  path: string,
  locale: Locale
): LocaleAlternates {
  const safeLocale = toLocale(locale);
  const ctx = getRoutingContext();
  const languages = Object.fromEntries(
    SUPPORTED_LOCALES.map((l) => [l, localizeHref(path || "/", l, ctx)])
  ) as Record<Locale | "x-default", string>;
  languages["x-default"] = languages[ctx.root];
  return {
    canonical: languages[safeLocale],
    languages,
  };
}

/* ===============================================================
   🌐 AKTİF DİLLERE GÖRE ALTERNATES — Çok Dilli Mimari Faz 1
   ===============================================================
   Metadata call-site'larının ORTAK kuralı (önceden her dosyada
   `isMultilingualEnabled(settings) ? {canonical, languages} :
   {canonical}` olarak tekrar ediyordu):
     • canonical: her zaman sayfanın kendi URL'si (değişmedi).
     • hreflang (`languages`): YALNIZ aktif diller + x-default.
       Kapalı dil hiçbir hreflang çıktısında görünmez.
     • Aktif dil sayısı < 2 (çoklu dil kapalı veya tek dil açık) →
       hreflang HİÇ basılmaz (tek dilli sitede hreflang anlamsızdır).
   Saf fonksiyon: settings çağırandan gelir, IO yok. */
type AlternatesSettings = Parameters<typeof getEnabledPublicLocales>[0];

export function filterLocaleLanguages(
  languages: Record<string, string>,
  enabledLocales: readonly Locale[],
  /** Faz 3 — x-default'un bağlanacağı dil (listede olmalı). Verilmezse
   *  gelen x-default aynen taşınır (eski davranış). */
  xDefaultLocale?: Locale
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const l of enabledLocales) {
    if (languages[l]) out[l] = languages[l];
  }
  if (xDefaultLocale && out[xDefaultLocale]) {
    out["x-default"] = out[xDefaultLocale];
  } else if (languages["x-default"]) {
    out["x-default"] = languages["x-default"];
  }
  return out;
}

/* 🌐 Faz 3 — hreflang kuralları:
     • Yalnız AKTİF diller ve (verilmişse) içeriğin GERÇEKTEN çevrildiği
       diller (`available`) listelenir.
     • Sayfanın kendi dili çeviri değilse (`locale` ∉ available) hreflang
       HİÇ basılmaz (o sayfa noindex'tir; yanlış çeviri ilişkisi kurulmaz).
     • x-default → ana dilin URL'si; ana dilde çeviri yoksa mevcut ilk
       sürüm (taban TR) — asla var olmayan bir URL'ye bağlanmaz.
     • Kalan dil sayısı < 2 → yalnız canonical. */
export type SeoAvailability = {
  available?: readonly Locale[];
  locale?: Locale;
};

export function pickSeoAlternates(
  settings: AlternatesSettings,
  canonical: string,
  languages: Record<string, string>,
  opts: SeoAvailability = {}
): { canonical: string; languages?: Record<string, string> } {
  const enabled = getEnabledPublicLocales(settings);
  const kept = opts.available
    ? enabled.filter((l) => opts.available!.includes(l))
    : enabled;
  if (opts.locale && !kept.includes(opts.locale)) return { canonical };
  if (kept.length < 2) return { canonical };
  const root = getRootLocale(settings);
  const xDefault = kept.includes(root) ? root : kept[0];
  return { canonical, languages: filterLocaleLanguages(languages, kept, xDefault) };
}

export function resolveSeoAlternates(
  settings: AlternatesSettings,
  path: string,
  locale: Locale
): { canonical: string; languages?: Record<string, string> } {
  const { canonical, languages } = buildLocaleAlternates(path, locale);
  return pickSeoAlternates(settings, canonical, languages);
}
