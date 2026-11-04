import type { Metadata } from "next";

import NotFoundContent from "@/app/components/not-found/NotFoundContent";
import { getNotFoundSuggestionVillas } from "@/app/services/villa.service";
import { getCachedSettings } from "@/lib/cache.helpers";
import { DEFAULT_LOCALE, getEnabledPublicLocales } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";

/* ===============================================================
   🌐 PUBLIC 404 — Çok Dilli Mimari Faz 3
   ===============================================================
   Eski `app/not-found.tsx`'in public gövdesi. Artık dil bazlı root
   layout'un (app/(public)/[lang]/layout.tsx) İÇİNDE render edilir →
   <html lang> doğru dil, header/footer/takip scriptleri public
   kabuktan gelir (artık burada tekrar render edilmez). Gövde metinleri
   ve linkler `NotFoundContent` içinde aktif dile göre (kapalı dilde
   varsayılan dile düşer). HTTP 404 + noindex (Next otomatik + burada
   açık robots).
   =============================================================== */

export const metadata: Metadata = {
  title: getDictionary(DEFAULT_LOCALE).notFound.metaTitle,
  description: getDictionary(DEFAULT_LOCALE).notFound.metaDescription,
  robots: { index: false, follow: true },
};

export default async function LocaleNotFound() {
  const [featured, settings] = await Promise.all([
    getNotFoundSuggestionVillas().catch(() => []),
    getCachedSettings().catch(() => null),
  ]);
  return (
    <NotFoundContent
      suggestionVillas={featured}
      enabledLocales={getEnabledPublicLocales(settings)}
    />
  );
}
