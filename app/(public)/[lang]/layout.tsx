import type { Metadata } from "next";

import { RootDocument, buildRootMetadata, rootViewport } from "@/app/_root/root-document";
import { getCachedSettings } from "@/lib/cache.helpers";
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  getEnabledPublicLocales,
  isSupportedLocale,
  type Locale,
} from "@/lib/i18n/config";
import { LOCALE_META } from "@/lib/i18n/locale-registry";

/* ===============================================================
   🌐 /[lang] — PUBLIC ROOT LAYOUT (Çok Dilli Mimari Faz 2 + 3)
   ===============================================================
   Public URL'ler proxy'de bu ağaca rewrite edilir:
     /kiralik-villalar      (ana dil TR) → /tr/kiralik-villalar
     /en/villas-for-rent                 → /en/kiralik-villalar
   Faz 3: bu layout public ağacın ROOT layout'udur →
     • <html lang> sayfanın gerçek dili (tr / en / de)
     • varsayılan Open Graph'a og:locale + og:locale:alternate (aktif
       diller) eklenir; sayfa kendi openGraph'ını verirse dispatcher
       aynı alanları oraya ekler (lib/i18n/routing/locale-route.tsx).
   Desteklenen her dil için statik parametre üretilir → statik/ISR
   davranışı korunur.
   =============================================================== */

export const viewport = rootViewport;

export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((lang) => ({ lang }));
}

function toLocaleParam(lang: string | undefined): Locale {
  return isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const locale = toLocaleParam((await params).lang);
  const [base, settings] = await Promise.all([
    buildRootMetadata(),
    getCachedSettings().catch(() => null),
  ]);
  const enabled = getEnabledPublicLocales(settings);
  const alternateLocale = enabled
    .filter((l) => l !== locale)
    .map((l) => LOCALE_META[l].ogLocale);
  return {
    ...base,
    openGraph: {
      ...(base.openGraph ?? {}),
      locale: LOCALE_META[locale].ogLocale,
      ...(alternateLocale.length ? { alternateLocale } : {}),
    },
  };
}

export default async function LocaleRootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const locale = toLocaleParam((await params).lang);
  return (
    <RootDocument lang={LOCALE_META[locale].hreflang}>{children}</RootDocument>
  );
}
