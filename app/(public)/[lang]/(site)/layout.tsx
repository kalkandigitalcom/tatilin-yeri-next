import PublicShell from "@/app/(public)/_shell/PublicShell";

/* ===============================================================
   🌐 (site) — public kabuk + 404 sınırı (Faz 3)
   ===============================================================
   Root layout (`[lang]/layout.tsx`) yalnız <html lang> belgesini
   kurar; header/footer/takip scriptleri bu iç layout'tadır. Route
   grubu URL'leri ETKİLEMEZ.
   404: kapalı dil, eşleşmeyen yol ve yayında olmayan villa/blog/sayfa
   proxy'de yakalanır ve app/global-not-found.tsx ile GERÇEK SSR olarak
   render edilir. Sayfa içinden fırlatılan `notFound()` (güvenlik ağı)
   bu segmentin `not-found.tsx`'ine düşer (Next 16: HTTP 404, gövde
   client render).
   =============================================================== */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <PublicShell>{children}</PublicShell>;
}
