/* ===============================================================
   🛡️ LOCALE SWITCH HELPER — PHASE 10C (TopBar dil değiştirici)
   ===============================================================
   AMAÇ: TopBar'daki dil değiştiricinin hedef URL'lerini üretmek.
   `buildLocaleAlternates()` (lib/i18n/seo-alternates.ts, Phase 7B)
   SAF bir path-şekillendirme fonksiyonu — hangi path'lerin GERÇEKTEN
   bir `/en`/`/de` route dosyasına sahip olduğunu BİLMİYOR/KONTROL
   ETMİYOR (bilinçli tasarım, kendi dosyasındaki yorumda açık).
   Bu dosya o eksik parçayı — "bu path'in bir locale route karşılığı
   var mı?" sorusunu — SAF ve MİNİMAL bir allowlist ile cevaplar.

   `buildLocaleAlternates` YENıDEN YAZILMADI/KOPYALANMADI — burada
   yalnız import edilip reuse edilir. `localeFromPathname` de burada
   KULLANILMAZ (bu dosyanın işi hedef tespiti değil, hedef URL
   üretimi — TopBar zaten kendi aktif locale'ini `localeFromPathname`
   ile ayrı tespit ediyor/edecek).

   ROUTE ALLOWLIST — yalnız BUGÜN gerçekten var olan `/en`/`/de` route
   dosyalarını yansıtır (bkz. `app/(public)/en|de/*`):
     - "/"                  → app/(public)/en|de/page.tsx (Phase 10C stub)
     - "/arama"             → app/(public)/en|de/arama/page.tsx (ComingSoon)
     - "/kiralik-villalar"  → app/(public)/en|de/kiralik-villalar/page.tsx (GERÇEK içerik)
     - "/iletisim"          → app/(public)/en|de/iletisim/page.tsx (GERÇEK içerik)
     - "/kiralik-villa/*"   → app/(public)/en|de/kiralik-villa/[slug]/page.tsx (Phase 10B, GERÇEK içerik)
     - "/rezervasyon/*"     → app/(public)/en|de/rezervasyon/[slug]/page.tsx (Phase 10B, GERÇEK içerik)
     - "/p/*"               → app/(public)/en|de/p/[slug]/page.tsx (Phase 12D, GERÇEK içerik)
     - "/villa-turleri/*", "/bolgeler/*" → app/(public)/en|de/…/[slug]/page.tsx (SEO landing)
   Yeni bir `/en`/`/de` route eklendiğinde bu liste GÜNCELLENMELİ —
   aksi halde o route için dil değiştirici (bilinçli, güvenli tarafta
   kalarak) ana sayfaya fallback yapar; bu 404/broken-link ÜRETMEZ,
   yalnız o yeni sayfanın locale karşılığını henüz "bilmiyor" olur.

   FALLBACK STRATEJİSİ (kullanıcı onayı: "Hedef locale'in ana sayfasına
   yönlendir"): allowlist'te olmayan bir base path için hedef locale'in
   KÖK sayfası döner (`/`, `/en`, `/de`) — asla 404/broken URL.
   =============================================================== */

import { SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/config";
import { getRoutingContext } from "@/lib/i18n/routing/context";
import { buildRoutePath, resolveRoute } from "@/lib/i18n/routing/url";

/* 🌐 Çok Dilli Mimari Faz 2 — allowlist yerine MERKEZİ ROUTE KAYDI.
   Kayıttaki her route'un tüm dillerde karşılığı vardır; dil seçici
   aynı içeriğin (aynı taban slug) hedef dildeki SEO URL'sine gider.
   Kayıtta olmayan yol → hedef dilin ana sayfası (eski güvenli
   fallback; asla 404 üretmez). */
export function hasLocaleRoute(basePath: string): boolean {
  return resolveRoute(basePath) !== null;
}

function normalizeSearchSuffix(search: string | null | undefined): string {
  if (!search) return "";
  const raw = search.startsWith("?") ? search.slice(1) : search;
  return raw.length > 0 ? `?${raw}` : "";
}

/**
 * Mevcut pathname için her locale'in hedef URL'ini üretir — TopBar'ın
 * dil değiştirici linkleri için. `buildLocaleAlternates` (Phase 7B)
 * ile TR-eşdeğeri base path'i türetir; bu base path'in gerçek bir
 * locale route'u varsa (`hasLocaleRoute`) o route'un 3 locale
 * varyantını, YOKSA (fallback) her locale'in kök sayfasını döner
 * (`/`, `/en`, `/de`) — ASLA 404/broken URL üretmez.
 *
 * `search` (opsiyonel): mevcut query string (`?a=1` veya `a=1`).
 * Verilirse — ve yalnız gerçek bir locale route'u olan path'lerde —
 * üretilen 3 hedefin SONUNA aynen eklenir. Fallback (locale karşılığı
 * olmayan path) durumunda query EKLENMEZ: hedef, o sayfanın değil
 * locale KÖKÜ olduğu için oraya taşınan filtre parametreleri anlamsız
 * olurdu — mevcut fallback davranışı BİREBİR korunur.
 */
export function getLocaleSwitchTargets(
  pathname: string | null | undefined,
  search?: string | null,
  /** Faz 2'den beri kullanılmıyor (TR ana sayfa yolu merkezi kuraldan
   *  gelir); imza geriye uyumluluk için korunur. */
  _trHomePath?: string | null
): Record<Locale, string> {
  void _trHomePath;
  const rawPath = pathname || "/";
  const queryIndex = rawPath.indexOf("?");
  const pathOnly = queryIndex === -1 ? rawPath : rawPath.slice(0, queryIndex);
  const inlineSearch = queryIndex === -1 ? "" : rawPath.slice(queryIndex + 1);
  const suffix = normalizeSearchSuffix(search ?? inlineSearch);

  const ctx = getRoutingContext();
  const route = resolveRoute(pathOnly || "/", ctx);
  const out = {} as Record<Locale, string>;
  for (const l of SUPPORTED_LOCALES) {
    out[l] = route
      ? `${buildRoutePath(route.key, route.params, l, ctx)}${suffix}`
      : buildRoutePath("home", {}, l, ctx);
  }
  return out;
}
