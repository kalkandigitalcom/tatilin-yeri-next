/* ===============================================================
   🌐 ROOT DOCUMENT — Çok Dilli Mimari Faz 3 (çoklu root layout)
   ===============================================================
   Eskiden `app/layout.tsx` olan TEK root layout'un içeriği (fontlar,
   global CSS, viewport, settings tabanlı varsayılan metadata ve
   <html>/<body> kabuğu) burada ortak modül olarak durur. İki root
   layout bunu kullanır:
     • app/(public)/[lang]/layout.tsx → <html lang> = sayfanın dili
     • app/(admin)/layout.tsx         → <html lang="tr">
   NEDEN: <html lang> değerinin sayfanın gerçek dili olabilmesi için
   kök layout'un dil parametresini bilmesi gerekir; `headers()` ile
   okumak tüm siteyi dinamik yapıp ISR'ı bozardı.
   =============================================================== */
import type { Metadata, Viewport } from "next";
import { Outfit, Geist_Mono } from "next/font/google";
import "leaflet/dist/leaflet.css";
import "../globals.css";

import { CurrencyProvider } from "@/app/context/CurrencyContext";
import { getCachedSettings } from "@/lib/cache.helpers";
import { publicLocaleCtxFromSettings } from "@/lib/i18n/content/public-shared-content";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import type { Locale } from "@/lib/i18n/config";
import { getPublicSettingsTexts, type SettingsTexts } from "@/lib/i18n/content/public-shared-content.server";
import { siteMetadataBase } from "@/lib/seo";
import { resolveAssetUrlVersioned } from "@/lib/storage.helpers";

/* 🛡️ PUBLIC BODY/UI + DISPLAY/HEADING FONT — Outfit. Global
   `--font-sans` VE `--font-display` bu tek fonta bağlanır (yalnızca
   `.admin-shell` altında Inter/Fraunces'e PINLENİR — aşağıda,
   globals.css içinde). next/font self-host + display:swap +
   adjustFontFallback (default) → CLS minimal. Admin gövde Inter'de
   kalır (aşağıda pin, ayrıca korunur). */
const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  display: "swap",
});

/* 🛡️ Inter + Fraunces — YALNIZ admin (`.admin-shell`) tipografisi.
   Tanımları `app/(admin)/maki-admin/admin-fonts.ts`'e taşındı: public
   sayfalarda kullanılmadıkları halde her sayfada preload edilip
   indiriliyorlardı. Font ayarları ve admin görünümü AYNEN. */

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

/* ===============================================================
   🛡️ ROOT VIEWPORT — viewport-fit=cover (safe-area aktivasyonu)
   ===============================================================
   `viewportFit: "cover"` olmadan `env(safe-area-inset-*)` iOS'ta 0
   döner; bu yüzden BottomNav / SearchBottomSheet / MobileBookingCta /
   SuccessModal içindeki `pb-[env(safe-area-inset-bottom)]` etkisizdi
   (çentikli iPhone'da alt home-indicator şeridi boş kalıyordu). cover
   ile bu padding'ler amaçlandığı gibi çalışır → mobil fixed bar'lar
   home-indicator'a kadar tam yapışır, alt boşluk kapanır. width /
   initialScale Next default'larıyla aynı (davranış değişmez). */
export const rootViewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/* ===============================================================
   🛡️ ROOT METADATA — settings-driven SEO fallback chain
   ===============================================================
   Fallback öncelikliği:
     page-specific generateMetadata (varsa)
       → settings.default_meta_title / description / og_image
         → bu dosyadaki hardcoded fallback
   Robots: settings.robots_index / robots_follow → default true/true.
   Verification: google / yandex / bing — meta tag olarak.
   theme-color: settings.browser_theme_color veya default.
   Icons: settings.favicon_url. Statik `app/favicon.ico` convention
   dosyası kasten YOK — eskiden Next auto-inject ettiği o link admin
   settings'ten yüklenen favicon'u override ediyordu (browser önce
   `/favicon.ico` hash'li URL'i çekiyor, settings link'ini ignore
   ediyordu). Artık tek favicon kaynağı settings; admin upload anında
   yeni URL metadata'ya yansır. favicon_url boşsa hiç link emit
   edilmez (browser default boş icon).
   =============================================================== */
export async function buildRootMetadata(locale?: Locale): Promise<Metadata> {
  const settings = await getCachedSettings().catch(() => null);
  /* 🌐 Faz 6 Dalga 4 — sabit Türkçe varsayılan kaldırıldı. Ayarda değer
     yoksa yedek ANA DİLİN sözlüğünden (`home.seo.metaTitleFallback` /
     `metaDescriptionFallback`; ana sayfa ile aynı anahtarlar). Ana dil
     daima aktiftir → pasif dil metni kullanılmaz. Ayar okunamazsa
     varsayılan bağlam (ana dil TR). İstek dili burada OKUNMAZ (Phase 7E: istek
     başlıkları ve çerezleri okunmaz) — ana dil ayardan gelir. Ayarlı değerin
     kaynağı (settings.default_meta_*) DEĞİŞMEDİ. */
  /* 🌐 Faz 6 Dalga 5 (karar B) — kayıtlı değer SAYFANIN DİLİNE göre,
     merkezi servisten (tekil kayıt kuralı, ana sayfa ile aynı):
       1) sayfanın kendi (aktif) dilindeki kayıtlı değer;
       2) yoksa ana dilin kayıtlı değeri (ana dilde bilinçli boş → yedeğe);
       3) o da yoksa ana dilin sözlük karşılığı.
     Pasif dil hiçbir adımda kullanılmaz. Dil verilmezse (admin kökü, 404)
     ana dil. Ana dil TR iken TR çıktısı eskisiyle birebir (TR satırı =
     settings ana kolonunun aynası; satır yoksa ana kolon kullanılır). */
  const root = publicLocaleCtxFromSettings(settings).root;
  const fallback = getDictionary(root).home.seo;
  let texts: SettingsTexts | null = null;
  try {
    texts = await getPublicSettingsTexts(locale ?? root, { otherActiveFallback: false });
  } catch {
    texts = null;
  }
  const title = texts?.default_meta_title?.trim() || fallback.metaTitleFallback;
  const description =
    texts?.default_meta_description?.trim() || fallback.metaDescriptionFallback;
  /* 🛡️ Aşama A — resolveAssetUrl normalize: FULL URL (legacy) ve
     relative path (yeni) için tutarlı render URL'i üretir. */
  const ogImage =
    resolveAssetUrlVersioned(settings?.default_og_image, settings?.updated_at) ||
    undefined;
  const favicon =
    resolveAssetUrlVersioned(settings?.favicon_url, settings?.updated_at) ||
    undefined;
  const themeColor = settings?.browser_theme_color?.trim() || "#1B1A17";

  const robotsIndex = settings?.robots_index !== false;
  const robotsFollow = settings?.robots_follow !== false;

  const verification: NonNullable<Metadata["verification"]> = {};
  if (settings?.google_site_verification?.trim()) {
    verification.google = settings.google_site_verification.trim();
  }
  if (settings?.yandex_verification?.trim()) {
    verification.yandex = settings.yandex_verification.trim();
  }
  if (settings?.bing_verification?.trim()) {
    /* Bing uses generic `other`. */
    verification.other = {
      "msvalidate.01": settings.bing_verification.trim(),
    };
  }

  return {
    /* 🛡️ metadataBase — TÜM relative canonical/OG URL'lerini canonical
       domain'e çözer (yoksa Next localhost'a düşerdi). Yalnız
       NEXT_PUBLIC_SITE_URL'den (bkz. lib/seo.ts). */
    metadataBase: siteMetadataBase(),
    title,
    description,
    robots: {
      index: robotsIndex,
      follow: robotsFollow,
    },
    openGraph: {
      type: "website",
      title,
      description,
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
    },
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      title,
      description,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
    ...(Object.keys(verification).length ? { verification } : {}),
    ...(favicon ? { icons: { icon: favicon } } : {}),
    other: {
      "theme-color": themeColor,
    },
  };
}

export function RootDocument({
  lang,
  children,
}: {
  lang: string;
  children: React.ReactNode;
}) {
  /* 🛡️ SEC-05 Phase 2 — GTM, `custom_head_scripts` ve `analytics_script`
     root'ta DEĞİL; yalnız public kabukta render edilir. */
  return (
    <html lang={lang} className={`${outfit.variable} ${geistMono.variable}`}>
      <head />
      <body className="min-h-screen bg-[var(--color-ivory)] text-[var(--color-stone-900)] antialiased font-sans">
        <CurrencyProvider>{children}</CurrencyProvider>
      </body>
    </html>
  );
}
