import type { MetadataRoute } from "next";

/* 🛡️ Public locale prefix'leri — `lib/i18n/config.ts`'in TEK doğruluk
   kaynağından türetilir (yeni bir locale listesi İCAT EDİLMEZ). */
import { SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/config";
import { primeRoutingContext } from "@/lib/i18n/routing/context.server";
import { getRoutingContext } from "@/lib/i18n/routing/context";
import { localizeHref } from "@/lib/i18n/routing/url";

/* ===============================================================
   🛡️ ROBOTS — Next.js App Router (production-grade crawl policy)
   ===============================================================
   POLİTİKA: "default allow + explicit disallow". Kök (/) crawl'a açık;
   yalnız internal / token / duplicate-risk path'ler kapatılır. Bu,
   indexlenmesi gereken sayfaları (villa detay, CMS, listeleme) ASLA
   yanlışlıkla kapatmaz.

   ALLOW (kapatılmaz — SEO değeri):
     /                       (anasayfa)
     /kiralik-villalar       (villa listesi)
     /kiralik-villa/[slug]   (villa detay — ASLA blocklanmaz)
     /p/[slug]               (CMS sayfaları)
     /iletisim, /teklif-al   (statik/landing)

   DISALLOW (crawl budget + duplicate + gizlilik):
     /maki-admin   → admin panel (indexlenmemeli)
     /api          → API route'ları (içerik değil)
     /arama        → faceted search; sonsuz query permütasyonu + duplicate
     /favoriler    → kullanıcı state + /favoriler/paylas/[token] (prefix kapsar)
     /liste/       → token-bazlı paylaşım listesi (per-user)
     /v/           → voucher (token, gizli)
     /rezervasyon/ → transactional checkout flow (villa detayın thin duplicate'i)

   PREFIX ÇAKIŞMA KONTROLÜ (doğrulandı):
     Hiçbir disallow prefix'i allow route'larıyla çakışmaz.
     Özellikle: `/kiralik-villa/` ve `/kiralik-villalar` AÇIK kalır;
     disallow listesinde `/kiralik-villa*` YOK. Villa sayfaları güvende.
     /v/ /liste/ /rezervasyon/ trailing-slash ile yazıldı (bu segmentlerin
     index page'i yok; yanlış pozitif blok riski yok).

   SITEMAP: absolute URL şart. NEXT_PUBLIC_SITE_URL (sitemap.ts ile aynı
     kaynak). Boşsa sitemap/host alanları OMIT edilir (geçersiz relative
     referans basılmaz) + uyarı loglanır.

   ⚠️ ÖN KOŞUL: NEXT_PUBLIC_SITE_URL prod'da `https://<domain>` olarak
     SET EDİLMELİ (build anında da; robots.txt static üretilir).

   FUTURE-PROOF: yeni public route eklenince DEFAULT ALLOW olur (kök açık).
     Yalnız yeni bir internal/token/duplicate path çıkarsa buraya disallow
     eklenir. Yeni SEO sayfaları otomatik crawl'a açık kalır.

   🛡️ LOCALE PREFIX'LERİ: Aşağıdaki TR path'lerinin `/en` ve `/de`
     varyantları AYNI politikaya tabidir (ör. `/arama` kapalıyken
     `/en/arama` açık kalmamalı — faceted search asimetrisi). Liste tek
     yerde tutulur; `withLocalePrefixes` her giriş için prefix'li
     kardeşlerini otomatik üretir. TR girdileri ve SIRA korunur; yeni bir
     route politikası EKLENMEZ, yalnız mevcut politika EN/DE'ye eşitlenir.
   =============================================================== */

/** TR (prefix'siz) disallow listesi — POLİTİKA KAYNAĞI. */
const DISALLOW_PATHS: readonly string[] = [
  "/maki-admin",
  "/api",
  "/arama",
  "/favoriler",
  "/liste/",
  "/v/",
  "/rezervasyon/",
];

/** `/maki-admin` ve `/api` locale-routed DEĞİLDİR → prefix üretilmez. */
const LOCALE_PREFIXED_EXCLUDES: readonly string[] = ["/maki-admin", "/api"];

/* 🌐 Faz 2 — dil bazlı yollar merkezi URL üreticisinden: her dil için
   (ana dil öneksiz, diğerleri önekli) o dilin SEO segmenti kullanılır
   (ör. EN: /en/search, /en/booking/). Sonu "/" olan girdiler önek
   kuralıdır (alt yolları kapsar). */
function localizedDisallow(trPath: string, locale: Locale): string {
  const isPrefixRule = trPath.endsWith("/");
  const probe = isPrefixRule ? `${trPath}__x__` : trPath;
  const out = localizeHref(probe, locale);
  return isPrefixRule ? out.replace(/__x__$/, "") : out;
}

function withLocalePrefixes(paths: readonly string[]): string[] {
  const out = new Set<string>();
  /* Önce ana dilin (öneksiz) girdileri — politika sırası AYNEN; sonra
     diğer diller sırayla. */
  const root = getRoutingContext().root;
  const order = [root, ...SUPPORTED_LOCALES.filter((l) => l !== root)];
  for (const l of order) {
    for (const p of paths) {
      out.add(LOCALE_PREFIXED_EXCLUDES.includes(p) ? p : localizedDisallow(p, l));
    }
  }
  return [...out];
}

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  ""
).replace(/\/+$/, "");

export default async function robots(): Promise<MetadataRoute.Robots> {
  await primeRoutingContext();
  if (!SITE_URL) {
    console.warn(
      "[robots] NEXT_PUBLIC_SITE_URL tanımsız — sitemap/host referansı OMIT edildi; prod'da SET EDİLMELİ."
    );
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: withLocalePrefixes(DISALLOW_PATHS),
      },
    ],
    /* Absolute URL yoksa OMIT — relative sitemap referansı geçersizdir. */
    sitemap: SITE_URL ? `${SITE_URL}/sitemap.xml` : undefined,
    host: SITE_URL || undefined,
  };
}
