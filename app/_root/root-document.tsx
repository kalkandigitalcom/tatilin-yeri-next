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
export async function buildRootMetadata(): Promise<Metadata> {
  const settings = await getCachedSettings().catch(() => null);
  const title =
    settings?.default_meta_title?.trim() || "Villa Kiralama — Lüks Villa Deneyimi";
  const description =
    settings?.default_meta_description?.trim() ||
    "Akdeniz'in seçkin villalarında özel havuz, deniz manzarası ve butik konfor. Hayalindeki tatili keşfet.";
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
