import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";

import PublicShell from "@/app/(public)/_shell/PublicShell";
import { RootDocument, buildRootMetadata, rootViewport } from "@/app/_root/root-document";
import NotFoundContent from "@/app/components/not-found/NotFoundContent";
import { getNotFoundSuggestionVillas } from "@/app/services/villa.service";
import { getCachedSettings } from "@/lib/cache.helpers";
import { getEnabledPublicLocales, isSupportedLocale, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { LOCALE_META } from "@/lib/i18n/locale-registry";
import { NOT_FOUND_LOCALE_HEADER } from "@/lib/i18n/routing/url";

/* ===============================================================
   🌐 GLOBAL 404 — Çok Dilli Mimari Faz 3 (son kontrol)
   ===============================================================
   TEK 404 RENDER NOKTASI. Next 16'da sayfa içinde fırlatılan
   `notFound()` HTML'e `<html id="__next_error__">` boş kabuğu basıp
   404 gövdesini yalnız JavaScript ile çizer. Hiçbir route'a uymayan
   yol ise bu dosyayla GERÇEK SSR + HTTP 404 üretir. Bu yüzden public
   404 kararları proxy'de verilir (lib/i18n/routing/url.ts →
   resolveIncomingPath "notFound"): kapalı dil, eşleşmeyen yol ve
   yayında olmayan villa / blog / sayfa → iç yol /<dil>/__404__ +
   `x-ty-404-locale` header'ı.

     • Header VAR (public 404): dil bazlı <html lang>, public kabuk
       (header/footer), dil bazlı gövde, robots noindex,follow.
     • Header YOK (bilinmeyen admin yolu, proxy dışı yollar): TR
       minimal sayfa, robots noindex,nofollow (admin kabuğu yok).
   Header'ı yalnız proxy yazar; istemcinin gönderdiği değer proxy'de
   silinir.
   =============================================================== */

export const viewport = rootViewport;

async function publicLocale(): Promise<Locale | null> {
  const raw = (await headers()).get(NOT_FOUND_LOCALE_HEADER);
  return isSupportedLocale(raw) ? raw : null;
}

export async function generateMetadata(): Promise<Metadata> {
  const [base, locale] = await Promise.all([
    buildRootMetadata().catch(() => ({}) as Metadata),
    publicLocale(),
  ]);
  if (!locale) {
    return {
      ...base,
      title: "Sayfa bulunamadı",
      robots: { index: false, follow: false },
    };
  }
  const dict = getDictionary(locale).notFound;
  return {
    ...base,
    title: dict.metaTitle,
    description: dict.metaDescription,
    alternates: undefined,
    robots: { index: false, follow: true },
  };
}

export default async function GlobalNotFound() {
  const locale = await publicLocale();

  if (locale) {
    const [featured, settings] = await Promise.all([
      getNotFoundSuggestionVillas().catch(() => []),
      getCachedSettings().catch(() => null),
    ]);
    return (
      <RootDocument lang={LOCALE_META[locale].hreflang}>
        <PublicShell>
          <NotFoundContent
            locale={locale}
            suggestionVillas={featured}
            enabledLocales={getEnabledPublicLocales(settings)}
          />
        </PublicShell>
      </RootDocument>
    );
  }

  return (
    <RootDocument lang="tr">
      <main className="min-h-screen flex flex-col items-center justify-center px-5 text-center">
        <p className="text-[11px] tracking-[0.28em] uppercase font-medium text-[var(--brand-coral)]">
          404
        </p>
        <h1 className="font-display text-[30px] md:text-[40px] mt-4 text-[var(--color-stone-900)]">
          Sayfa bulunamadı
        </h1>
        <Link
          href="/"
          className="mt-8 inline-flex items-center justify-center px-6 py-3 rounded-full bg-[var(--color-stone-900)] text-white text-[14px] font-medium"
        >
          Ana sayfa
        </Link>
      </main>
    </RootDocument>
  );
}
