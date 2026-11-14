"use client";

import { localeOfPath, toBaseRoutePath } from "@/lib/i18n/routing/url";
import Link from "next/link";
import Image from "next/image";
import { useState, useEffect, useRef, useId, useCallback } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { Menu, X, ChevronDown, ArrowRight } from "lucide-react";
import { usePathname } from "next/navigation";
import TopBar from "./TopBar";
/* 🛡️ FAZ 36 — Favorites shortcut (localStorage badge counter) */
import HeaderFavoritesLink from "@/app/components/favorites/HeaderFavoritesLink";
/* 🛡️ Canlı arama paylaşılan component (header + hero) — duplikasyon yok.
   Arama state/debounce/dropdown mantığı VillaSearchBox'a taşındı. */
import VillaSearchBox from "@/app/components/layout/VillaSearchBox";
/* 🛡️ PHASE 2 — UI Translation Dictionary Core.
   🛡️ PHASE 9A GÜNCELLEMESİ — artık modül seviyesinde SABİT
   DEFAULT_LOCALE değil; component gövdesinde, zaten mevcut olan
   `usePathname()` sonucundan `localeFromPathname()` (lib/i18n/config.ts,
   Phase 9A) ile locale tespit edilip `getDictionary(locale)` HER
   RENDER'DA çağrılır (saf/ucuz fonksiyon — DB sorgusu YOK, yeni bir
   cache mekanizması gerektirmiyor). TR route'larında (pathname `/en`
   veya `/de` ile başlamıyorsa) `localeFromPathname` DEFAULT_LOCALE
   ("tr") döner — dictionary.header.offer/menuOpen/menuClose değerleri
   ÖNCEKİ sabit TR metinlerle ("Teklif Al" / "Menüyü aç" / "Menüyü
   kapat") BİREBİR aynı, TR render çıktısı DEĞİŞMEDİ. Middleware/
   headers() KULLANILMADI (bkz. Phase 9A audit — bu, Footer'ın aksine
   Header zaten "use client" olduğu ve `usePathname()`'e sahip olduğu
   için mümkün; site-wide dynamic-rendering riski YOK). */
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { DEFAULT_LOCALE } from "@/lib/i18n/config";
/* 🛡️ NAVIGATION LOCALE PERSISTENCE — iç linkler aktif locale'i taşır.
   Yeni bir routing sistemi DEĞİL; `buildLocaleAlternates` (Phase 7B)
   üzerine ince, saf sarmalayıcı (bkz. lib/i18n/locale-href.ts). */
import { localeHref } from "@/lib/i18n/locale-href";
import { formatDictionaryString } from "@/lib/i18n/format-dictionary-string";
/* 🛡️ PHASE 10H — `source_type: "category"` menü öğelerinin adı (villa
   tipi) locale'e göre çözülür; çeviri yoksa canonical TR adı kalır.
   Saf helper — DB/server bağımlılığı YOK. */
import {
  resolveTaxonomyName,
  type TaxonomyNameByLocale,
} from "@/lib/i18n/taxonomy-name.helper";

/* ===============================================================
   🛡️ FAZ 39C — HEADER CSS CLEANUP
   ===============================================================
   ÖNCE (FAZ 38 ardından):
     - `transparent` boolean dead constant'tı (always false)
     - Tüm `transparent ? "white..." : "stone..."` ternary'leri
       her zaman ikinci branch'a düşüyordu → dead code + okuma yükü
     - `useMemo` import edilmişti ama kullanılmıyordu
     - Logo span'ı `text-[var(--color-champagne-500)]` (cyan) →
       yeni coral brand identity ile çelişiyordu
     - Mobile favorites pill `hover:border-champagne-500` (cyan) →
       coral brand ile çelişiyordu
     - Desktop & mobile CTAs `bg-stone-900` + `text-white` ham black
       pill → coral luxury button system ile çelişiyordu
     - Search spinner `border-champagne-500` (cyan) → coral aksenti
       eksikti

   SONRA (FAZ 39C):
     - `transparent` kaldırıldı; tüm ternary'ler kaldırıldı
     - useMemo import kaldırıldı
     - Logo accent → coral
     - Mobile favorites hover → coral
     - Desktop CTA → `.btn-primary` (luxury coral system)
     - Mobile CTA → `.btn-primary` (zaten kullanılıyordu; ✔)
     - Search spinner → coral

   KORUNAN BEHAVIOR (zero touch):
     - State hooks: open, search, results, loading, openSearch, scrolled
     - useEffect: pathname reset, scroll watch, live search debounce
       + memory-leak guard, outside-click
     - getImage helper
     - Live search query (visibility filter ile)
     - Logo (settings.site_logo) + wordmark fallback
     - Mobile menu open/close
     - HeaderFavoritesLink (artık `variant="default"` sabiti)
   =============================================================== */

type MenuItem = {
  id?: string;
  name: string;
  href: string;
  children?: MenuItem[];
  /** 🛡️ PHASE 10H — OPSİYONEL. Yalnız villa tipi (`category`) kaynaklı
   *  öğelerde `HeaderWrapper` tarafından doldurulur; diğer öğelerde
   *  undefined → canonical `name` gösterilir (eski davranış). */
  nameByLocale?: TaxonomyNameByLocale;
  /** 🧭 Mega menü — `getMenu()` ağacından AYNEN gelen kaynak bilgisi. */
  source_type?: string;
  /** 🧭 Mega menü — `HeaderWrapper` ekler (bölge/kategori kapağı). */
  imageUrl?: string | null;
  /** 🧭 Mega menü — `HeaderWrapper` ekler (aktif villa sayısı). */
  villaCount?: number;
};

/* ===============================================================
   🧭 MEGA MENÜ (yalnız masaüstü nav)
   ===============================================================
   Alt öğelerinin çoğunluğu `region` ya da `category` kaynaklı olan üst
   menü öğesi, eski küçük dropdown yerine geniş bir panel açar. Linkler,
   adlar ve sıra `getMenu()` ağacından AYNEN gelir (URL/slug üretimi
   değişmedi); kartın görseli ve villa sayısı HeaderWrapper'ın mevcut
   cache okumalarından eklenir. Hiçbir alt link kaybolmaz: öne çıkan
   kartlara girmeyenler panelin altında kompakt link olarak listelenir.
   Diğer menü öğeleri ve mobil hamburger menü DEĞİŞMEDİ. */
type MegaKind = "regions" | "categories";

function megaKindOf(item: MenuItem): MegaKind | null {
  const kids = item.children ?? [];
  if (kids.length === 0) return null;
  const regions = kids.filter((c) => c.source_type === "region").length;
  const categories = kids.filter((c) => c.source_type === "category").length;
  if (regions > 0 && regions >= categories && regions * 2 >= kids.length) return "regions";
  if (categories > 0 && categories * 2 >= kids.length) return "categories";
  return null;
}

/** Öne çıkanlar: villa sayısına göre azalan, eşitlikte menü sırası. */
function featuredOf(items: MenuItem[], limit: number): MenuItem[] {
  return items
    .map((c, i) => ({ c, i }))
    .sort((a, b) => (b.c.villaCount ?? -1) - (a.c.villaCount ?? -1) || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.c);
}

const MEGA_OPEN_DELAY = 90;
const MEGA_CLOSE_DELAY = 220;

export default function Header({
  menu = [],
  siteLogo = null,
  trHomeHref = "/",
}: {
  menu?: MenuItem[];
  /* settings.site_logo — boşsa text wordmark fallback */
  siteLogo?: string | null;
  /* 🔄 TR ana sayfanın yolu. Varsayılan dil EN/DE iken "/" bir
     YÖNLENDİRİCİ olduğu için HeaderWrapper "/tr" geçer; aksi halde
     (ve prop hiç verilmezse) "/" → davranış BYTE-IDENTICAL. */
  trHomeHref?: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  /* 🛡️ PHASE 9A — locale, ZATEN var olan `pathname`'den saf/senkron
     şekilde türetilir; middleware/headers() gerektirmez. `getDictionary`
     saf bir modül-import lookup'ı (DB sorgusu YOK) — her render'da
     çağrılmasının performans maliyeti yoktur. TR path'lerinde
     (pathname `/en`/`/de` ile başlamıyorsa) `dictionary` ÖNCEKİ modül-
     seviyesi sabitle (`getDictionary(DEFAULT_LOCALE)`) BİREBİR AYNI
     referans/değerleri döner. */
  const locale = localeOfPath(pathname);
  const dictionary = getDictionary(locale);

  /* TR'de ana sayfa hedefi `trHomeHref`; EN/DE'de mevcut
     `localeHref` davranışı AYNEN korunur. */
  const homeHref =
    locale === DEFAULT_LOCALE ? trHomeHref : localeHref("/", locale);

  /* 🛡️ Header search (desktop + mobile) TÜM sayfalarda gösterilir —
     anasayfa dahil (eski `!isHome` gizleme kaldırıldı). İç sayfa
     davranışı birebir aynı; paylaşılan VillaSearchBox mantığı değişmedi.
     Hero / HeroSearchPanel / HeroStickySearch AYNEN korunur. */

  const [scrolled, setScrolled] = useState(false);

  /* 🛡️ MOBILE SUBMENU ACCORDION — hangi ana menü öğelerinin alt
     menüsü açık, id/name bazlı Set ile tutuluyor. Birden fazla
     submenu bağımsız açık kalabilir (biri diğerini otomatik
     kapatmaz). Başlangıç: boş Set → tüm alt menüler kapalı.
     Yalnızca mobile hamburger drawer'ı için; desktop `group-hover`
     dropdown sistemine dokunulmadı. */
  const [openSubmenus, setOpenSubmenus] = useState<Set<string>>(
    new Set()
  );

  function toggleSubmenu(key: string) {
    setOpenSubmenus((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  /* Hamburger tamamen kapanınca submenu state'i de temizlenir —
     kullanıcı menüyü tekrar açtığında bütün alt menüler yine
     kapalı gelir. */
  function closeMobileMenu() {
    setOpen(false);
    setOpenSubmenus(new Set());
  }

  useEffect(() => {
    setOpen(false);
    setOpenSubmenus(new Set());
  }, [pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* 🧭 MEGA MENÜ STATE — aynı anda tek panel açık (anahtar = öğe id/adı).
     Fare: hover-intent (kısa açılma / kontrollü kapanma gecikmesi →
     titreme yok). Dokunmatik: ilk dokunuş paneli açar, ikinci dokunuş
     linke gider. Klavye: ok butonu (aria-expanded) + ESC. */
  const [megaOpen, setMegaOpen] = useState<string | null>(null);
  const megaTimers = useRef<{ open?: ReturnType<typeof setTimeout>; close?: ReturnType<typeof setTimeout> }>({});
  const lastPointerType = useRef<string>("mouse");
  const megaIdPrefix = useId();

  const clearMegaTimers = useCallback(() => {
    clearTimeout(megaTimers.current.open);
    clearTimeout(megaTimers.current.close);
  }, []);

  const closeMega = useCallback(() => {
    clearMegaTimers();
    setMegaOpen(null);
  }, [clearMegaTimers]);

  function onMegaPointerEnter(key: string, e: ReactPointerEvent) {
    if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
    clearTimeout(megaTimers.current.close);
    if (megaOpen === key) return;
    clearTimeout(megaTimers.current.open);
    /* Başka bir panel zaten açıksa geçiş ANINDA (menüler arası gezinme). */
    if (megaOpen) {
      setMegaOpen(key);
      return;
    }
    megaTimers.current.open = setTimeout(() => setMegaOpen(key), MEGA_OPEN_DELAY);
  }

  function onMegaPointerLeave(e: ReactPointerEvent) {
    if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
    clearTimeout(megaTimers.current.open);
    clearTimeout(megaTimers.current.close);
    megaTimers.current.close = setTimeout(() => setMegaOpen(null), MEGA_CLOSE_DELAY);
  }

  /* Dokunmatik: kapalı paneli ilk dokunuşta aç (navigasyonu durdur). */
  function onMegaTriggerClick(key: string, e: ReactMouseEvent) {
    if (lastPointerType.current !== "mouse" && lastPointerType.current !== "pen" && megaOpen !== key) {
      e.preventDefault();
      clearMegaTimers();
      setMegaOpen(key);
    }
  }

  function focusFirstMegaLink(panelId: string) {
    const first = document.getElementById(panelId)?.querySelector<HTMLElement>("a[href]");
    first?.focus();
  }

  function onMegaToggleKeyDown(key: string, panelId: string, e: ReactKeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      clearMegaTimers();
      setMegaOpen(key);
      /* panel görünür olduktan sonra odak (bir sonraki kare) */
      requestAnimationFrame(() => focusFirstMegaLink(panelId));
    }
  }

  /* Rota değişince panel kapanır (render sırasında state ayarı —
     React'in "prop değişince state sıfırla" deseni; effect yok). */
  const [megaPath, setMegaPath] = useState(pathname);
  if (megaPath !== pathname) {
    setMegaPath(pathname);
    setMegaOpen(null);
  }

  /* Açıkken: ESC kapatır (odak ok butonuna döner), dışarı tıklama
     kapatır. Dinleyiciler yalnız panel açıkken bağlı. */
  useEffect(() => {
    if (!megaOpen) return;
    const root = () =>
      document.querySelector<HTMLElement>(`[data-mega-root="${CSS.escape(megaOpen)}"]`);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const r = root();
      const hadFocus = !!r && r.contains(document.activeElement);
      closeMega();
      if (hadFocus) r?.querySelector<HTMLElement>("[data-mega-toggle]")?.focus();
    };
    const onDown = (e: PointerEvent) => {
      const r = root();
      if (r && e.target instanceof Node && r.contains(e.target)) return;
      closeMega();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [megaOpen, closeMega]);

  useEffect(() => () => clearMegaTimers(), [clearMegaTimers]);

  const fmtCount = (n: number, many: string, one: string) =>
    formatDictionaryString(n === 1 ? one : many, { count: n.toLocaleString(locale) });

  /* Subtle scroll-state shadow: scrolled iken hairline shadow ekle.
     Tek kompozit class — eski ternary çağrısı kaldırıldı. */
  const headerShellClass =
    "transition-shadow duration-300 motion-reduce:transition-none " +
    "bg-white/92 backdrop-blur-xl backdrop-saturate-150 " +
    "border-b border-[var(--color-stone-100)] " +
    (scrolled
      ? "shadow-[0_8px_24px_-12px_rgba(27,26,23,0.08)]"
      : "shadow-none");

  /* 🛡️ TEKLİF AL (desktop) — artık `nav` / `menu.map()` İÇİNDE DEĞİL.
     Sağ aksiyon alanında (`hidden md:flex items-center gap-3`) sabit,
     her zaman görünen bir action olarak render edilir; "Villa Arama"
     ve diğer nav menü öğelerinin DB sırasına hiçbir bağımlılığı yok.
     Marka renkleri (#ED7926 → #0973BA) ve breathing/pulse glow
     animasyonu AYNEN korunur (TopBar shimmer'ı KULLANMAZ; Tailwind
     `animate-pulse` ile nefes alan halo — globals.css'e dokunulmadı). */
  const teklifAlDesktopCta = (
    <div className="group relative">
      <span
        aria-hidden
        className="
          pointer-events-none absolute -inset-1.5 rounded-full
          bg-gradient-to-r from-[#ED7926] to-[#0973BA]
          opacity-40 blur-md
          animate-pulse [animation-duration:2.8s]
          group-hover:opacity-70 group-hover:blur-lg
          transition-[opacity,filter] duration-300
          motion-reduce:animate-none
        "
      />
      <Link
        href={localeHref("/teklif-al", locale)}
        className="
          relative inline-flex items-center justify-center
          px-4 py-[7px] rounded-full
          text-[12.5px] font-semibold tracking-[0.01em] text-white
          bg-gradient-to-r from-[#ED7926] to-[#0973BA]
          shadow-[0_6px_16px_-4px_rgba(237,121,38,0.45),0_6px_16px_-4px_rgba(9,115,186,0.35)]
          hover:shadow-[0_10px_26px_-4px_rgba(237,121,38,0.6),0_10px_26px_-4px_rgba(9,115,186,0.5)]
          hover:-translate-y-[1px]
          transition-[box-shadow,transform] duration-300
          motion-reduce:transition-none motion-reduce:hover:translate-y-0
          focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#0973BA]/50
        "
      >
        {dictionary.header.offer}
      </Link>
    </div>
  );

  /* 🧭 Mega menü kartı — mevcut kapak görseli + gradient + ad + sayı. */
  function renderMegaCard(child: MenuItem, variant: "hero" | "tile" | "category", className: string) {
    const name = resolveTaxonomyName(child.name, child.nameByLocale, locale);
    const count =
      typeof child.villaCount === "number"
        ? fmtCount(child.villaCount, dictionary.header.megaVillaCount, dictionary.header.megaVillaCountOne)
        : null;
    const sizes =
      variant === "hero" ? "(max-width: 1280px) 400px, 440px" : variant === "category" ? "280px" : "220px";
    return (
      <Link
        key={child.id || child.href}
        href={localeHref(child.href, locale)}
        onClick={closeMega}
        data-mega-card={variant}
        className={
          "group/card relative isolate block overflow-hidden rounded-2xl bg-[var(--color-stone-100)] " +
          "ring-1 ring-black/5 shadow-[0_6px_18px_-12px_rgba(11,31,58,0.35)] " +
          "transition-[box-shadow,transform] duration-300 motion-reduce:transition-none " +
          "hover:shadow-[0_16px_32px_-16px_rgba(11,31,58,0.45)] hover:-translate-y-0.5 motion-reduce:hover:translate-y-0 " +
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0973BA] focus-visible:ring-offset-2 " +
          className
        }
      >
        {child.imageUrl ? (
          <Image
            src={child.imageUrl}
            alt=""
            fill
            sizes={sizes}
            className="object-cover object-center transition-transform duration-[700ms] ease-out group-hover/card:scale-[1.06] motion-reduce:transition-none motion-reduce:group-hover/card:scale-100"
          />
        ) : (
          <span
            aria-hidden
            className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[var(--color-sand-50)] to-[var(--color-stone-100)] font-display text-[44px] leading-none text-[var(--color-stone-300)] select-none"
          >
            {name.trim().charAt(0)}
          </span>
        )}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[rgba(11,20,35,0.82)] via-[rgba(11,20,35,0.22)] to-transparent"
        />
        <span
          className={
            "absolute inset-x-0 bottom-0 flex flex-col text-white " +
            (variant === "hero" ? "p-5 gap-1" : "p-3.5 gap-0.5")
          }
        >
          <span
            className={
              "font-display font-semibold leading-tight tracking-[-0.01em] drop-shadow-sm " +
              (variant === "hero" ? "text-[28px]" : "text-[16px]")
            }
          >
            {name}
          </span>
          {count && (
            <span
              className={
                "font-medium text-white/85 " + (variant === "hero" ? "text-[14px]" : "text-[12.5px]")
              }
            >
              {count}
            </span>
          )}
        </span>
      </Link>
    );
  }

  function renderMegaItem(item: MenuItem, itemName: string, isActive: boolean, kind: MegaKind) {
    const key = String(item.id || item.name);
    const isOpen = megaOpen === key;
    const panelId = `${megaIdPrefix}-mega-${key}`.replace(/[^A-Za-z0-9_-]/g, "");
    const kids = item.children ?? [];
    const pool = kids.filter((c) => c.source_type === (kind === "regions" ? "region" : "category"));
    const featured = featuredOf(pool, kind === "regions" ? 5 : 6);
    const featuredSet = new Set(featured);
    const rest = kids.filter((c) => !featuredSet.has(c));
    const h = dictionary.header;
    const title = kind === "regions" ? h.megaRegionsTitle : h.megaCategoriesTitle;
    const total =
      kind === "regions"
        ? fmtCount(pool.length, h.megaRegionsCount, h.megaRegionsCountOne)
        : fmtCount(pool.length, h.megaCategoriesCount, h.megaCategoriesCountOne);
    const allLabel = kind === "regions" ? h.megaRegionsAll : h.megaCategoriesAll;
    /* "Tümünü gör" hedefi: üst menü öğesinin KENDİ linki (yeni route yok);
       link tanımsızsa mevcut arama sayfası. */
    const allHref = item.href && item.href !== "#" ? item.href : "/arama";

    let grid: React.ReactNode;
    if (kind === "regions") {
      if (featured.length >= 5) {
        grid = (
          <div className="grid grid-cols-4 grid-rows-2 gap-3 h-[296px]">
            {featured.map((c, i) =>
              renderMegaCard(c, i === 0 ? "hero" : "tile", i === 0 ? "col-span-2 row-span-2" : "")
            )}
          </div>
        );
      } else {
        const cols = ["grid-cols-1", "grid-cols-2", "grid-cols-3", "grid-cols-4"][featured.length - 1] ?? "grid-cols-4";
        grid = (
          <div className={"grid gap-3 h-[220px] " + cols}>
            {featured.map((c, i) => renderMegaCard(c, i === 0 ? "hero" : "tile", ""))}
          </div>
        );
      }
    } else {
      grid = (
        <div className="grid grid-cols-3 gap-3">
          {featured.map((c) => renderMegaCard(c, "category", "h-[132px]"))}
        </div>
      );
    }

    return (
      <div
        key={item.id || item.name}
        data-mega-root={key}
        className="group py-0"
        onPointerEnter={(e) => onMegaPointerEnter(key, e)}
        onPointerLeave={onMegaPointerLeave}
        onBlur={(e) => {
          const next = e.relatedTarget as Node | null;
          if (isOpen && (!next || !e.currentTarget.contains(next))) closeMega();
        }}
      >
        <div className="relative flex items-center gap-0.5 py-5">
          <Link
            href={localeHref(item.href, locale)}
            onPointerDown={(e) => {
              lastPointerType.current = e.pointerType;
            }}
            onClick={(e) => onMegaTriggerClick(key, e)}
            className={
              "flex items-center transition-colors motion-reduce:transition-none " +
              (isActive || isOpen
                ? "text-[var(--color-stone-900)]"
                : "hover:text-[var(--color-stone-900)]")
            }
          >
            {itemName}
          </Link>
          <button
            type="button"
            data-mega-toggle
            aria-expanded={isOpen}
            aria-controls={panelId}
            aria-label={formatDictionaryString(isOpen ? h.submenuCloseAriaLabel : h.submenuOpenAriaLabel, {
              label: itemName,
            })}
            onClick={() => {
              clearMegaTimers();
              setMegaOpen(isOpen ? null : key);
            }}
            onKeyDown={(e) => onMegaToggleKeyDown(key, panelId, e)}
            className="-mr-1 inline-flex h-6 w-6 items-center justify-center rounded-full !bg-transparent text-current hover:text-[var(--color-stone-900)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0973BA]/50"
          >
            <ChevronDown
              size={14}
              aria-hidden
              className={
                "opacity-70 transition-transform duration-200 motion-reduce:transition-none " +
                (isOpen ? "rotate-180" : "")
              }
            />
          </button>

          <span
            aria-hidden="true"
            className={
              "absolute left-0 right-0 -bottom-px mx-auto h-[2px] w-6 rounded-full transition-opacity duration-300 motion-reduce:transition-none " +
              "bg-[var(--brand-coral)] " +
              (isActive || isOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100")
            }
          />
        </div>

        {/* Panel satıra (relative) göre konumlanır; üstteki şeffaf
            pt alanı tetikleyici ile panel arasında "köprü"dür. */}
        <div
          id={panelId}
          data-mega-panel={kind}
          data-open={isOpen ? "true" : "false"}
          className={
            "absolute left-1/2 top-[calc(100%-10px)] z-[999] w-[min(880px,calc(100vw-48px))] pt-3 " +
            "duration-200 ease-out motion-reduce:transition-none " +
            /* Açılırken görünürlük ANINDA (odak/klavye için), kapanırken
               opaklıkla birlikte gecikmeli gizlenir. */
            (isOpen
              ? "transition-[opacity,transform] visible opacity-100 -translate-x-1/2 translate-y-0"
              : "transition-[opacity,transform,visibility] invisible opacity-0 -translate-x-1/2 translate-y-1.5 pointer-events-none")
          }
        >
          <div className="rounded-[22px] border border-[var(--color-stone-100)] bg-white p-5 shadow-[0_28px_60px_-24px_rgba(11,31,58,0.28),0_2px_8px_-4px_rgba(11,31,58,0.08)]">
            <div className="mb-4 flex items-baseline gap-2 px-0.5">
              <span className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[var(--color-stone-500)]">
                {title}
              </span>
              <span aria-hidden className="text-[var(--color-stone-300)]">·</span>
              <span className="text-[12px] font-semibold text-[var(--brand-coral)]">{total}</span>
            </div>

            {grid}

            {rest.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-[var(--color-stone-400)]">
                  {h.megaMore}
                </span>
                {rest.map((c) => (
                  <Link
                    key={c.id || c.href}
                    href={localeHref(c.href, locale)}
                    onClick={closeMega}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-stone-100)] bg-[var(--color-sand-50)] px-3 py-1.5 text-[13px] font-medium text-[var(--color-stone-700)] transition-colors hover:border-[var(--color-stone-200)] hover:bg-white hover:text-[var(--color-stone-900)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0973BA]/50"
                  >
                    {resolveTaxonomyName(c.name, c.nameByLocale, locale)}
                    {typeof c.villaCount === "number" && (
                      <span className="text-[11.5px] font-semibold text-[var(--color-stone-400)]">
                        {c.villaCount.toLocaleString(locale)}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            )}

            <div className="mt-4 border-t border-[var(--color-stone-100)] pt-3.5">
              <Link
                href={localeHref(allHref, locale)}
                onClick={closeMega}
                className="group/all inline-flex items-center gap-1.5 rounded-md text-[14px] font-semibold text-[#0973BA] hover:text-[#0b1f3a] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0973BA]/50"
              >
                {allLabel}
                <ArrowRight
                  size={16}
                  aria-hidden
                  className="transition-transform duration-200 group-hover/all:translate-x-0.5 motion-reduce:transition-none"
                />
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <header className="w-full fixed top-0 z-50">
        <TopBar />

        <div className={headerShellClass}>
          <div className="relative max-w-[1480px] mx-auto px-5 md:px-10 lg:px-16 h-[72px] md:h-[80px] flex items-center justify-between">
            {/* LOGO */}
            <Link
              href={homeHref}
              className="
                font-display text-2xl tracking-tight
                flex items-center
                text-[var(--color-stone-900)]
                hover:text-[var(--color-stone-700)]
                transition-colors motion-reduce:transition-none
              "
            >
              {siteLogo ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={siteLogo}
                  alt={dictionary.header.logoAlt}
                  className="h-12 w-auto object-contain"
                />
              ) : (
                <>
                  Villa
                  {/* 🛡️ FAZ 39C — Coral brand accent (was cyan champagne). */}
                  <span className="text-[var(--brand-coral)]">Kiralama</span>
                </>
              )}
            </Link>

            {/* MENU — ultra clean, premium spacing */}
            <nav
              className="
                hidden md:flex gap-8 lg:gap-10
                text-[15px] font-medium tracking-[0.01em]
                text-[var(--color-stone-700)]
              "
            >
              {menu.map((item) => {
                const isActive = toBaseRoutePath(pathname) === item.href;
                const hasChildren = item.children && item.children.length > 0;
                /* 🛡️ PHASE 10H — villa tipi (category) öğelerinde
                   locale karşılığı; diğer öğelerde canonical `name`. */
                const itemName = resolveTaxonomyName(
                  item.name,
                  item.nameByLocale,
                  locale
                );

                const megaKind = megaKindOf(item);
                if (megaKind) {
                  return renderMegaItem(item, itemName, isActive, megaKind);
                }

                return (
                  <div
                    key={item.id || item.name}
                    className="relative group py-5"
                  >
                    <Link
                      href={localeHref(item.href, locale)}
                      className={
                        "flex items-center gap-1 transition-colors motion-reduce:transition-none " +
                        (isActive
                          ? "text-[var(--color-stone-900)]"
                          : "hover:text-[var(--color-stone-900)]")
                      }
                    >
                      {itemName}
                      {hasChildren && (
                        <ChevronDown size={14} className="opacity-70" />
                      )}
                    </Link>

                    {/* Coral underline accent (FAZ 38) */}
                    <span
                      aria-hidden="true"
                      className={
                        "absolute left-0 right-0 -bottom-px mx-auto h-[2px] w-6 rounded-full transition-opacity duration-300 motion-reduce:transition-none " +
                        "bg-[var(--brand-coral)] " +
                        (isActive
                          ? "opacity-100"
                          : "opacity-0 group-hover:opacity-100")
                      }
                    />

                    {hasChildren && (
                      <div className="absolute left-1/2 -translate-x-1/2 top-full pt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-[999]">
                        <div className="w-56 bg-white rounded-2xl shadow-[0_24px_48px_-16px_rgb(27_26_23/0.18)] border border-[var(--color-stone-100)] overflow-hidden">
                          {item.children!.map((child) => (
                            <Link
                              key={child.id}
                              href={localeHref(child.href, locale)}
                              className="block px-5 py-3 text-[16px] text-[var(--color-stone-700)] hover:bg-[var(--color-sand-50)] hover:text-[var(--color-stone-900)] transition"
                            >
                              {resolveTaxonomyName(
                                child.name,
                                child.nameByLocale,
                                locale
                              )}
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>

            {/* RIGHT — CTA + search + favorites */}
            <div className="hidden md:flex items-center gap-3">
              {/* 🛡️ TEKLİF AL (desktop) — sağ aksiyon alanının EN BAŞINDA,
                 sabit konumda. Konum artık DB menü verisinden bağımsız. */}
              {teklifAlDesktopCta}

              {/* SEARCH — paylaşılan VillaSearchBox. Artık anasayfa dahil
                 tüm sayfalarda görünür. */}
              {/* 🛡️ PHASE 11 — arama kutusu metinleri locale'e göre. */}
              <VillaSearchBox variant="desktop" locale={locale} />

              {/* Favorites shortcut (FAZ 36).
                 🛡️ FAZ 39C: variant prop kaldırıldı (dead). */}
              <HeaderFavoritesLink locale={locale} />
            </div>

            {/* 🛡️ MOBILE ACTIONS — search input + hamburger toggle.
               Yerleşim: [ Villa ara... ] [ ☰ ]
               Eski mobil arama drawer içindeydi (kullanıcı hamburger
               açmadan göremiyordu); kullanılabilirlik için header
               strip'e taşındı. State (search/openSearch/results/loading)
               + debounce + outside-click handler değişmedi — input
               sadece DOM konumu değiştirdi. Desktop branch'e dokunulmadı
               (`md:hidden` mobil-only). */}
            <div className="md:hidden flex items-center gap-2">
              {/* 🛡️ MOBILE SEARCH kaldırıldı — mobilde tek villa-adı arama
                 girişi Bottom Navigation → Arama → SearchBottomSheet.
                 Çift arama olmaması için header mobil arama render EDİLMEZ.
                 Desktop arama (hidden md:flex bloğu) AYNEN korunur. */}

              {/* 🛡️ MOBILE FAVORITES — hamburger'ın solunda ikon-only
                 favori girişi. Desktop ile AYNI HeaderFavoritesLink
                 component'i (ikon + köşe badge); yalnız `md:hidden` bu
                 blokta → desktop cluster'daki kopya etkilenmez. Eski
                 drawer içi "Favorilerim" satırı kaldırıldı. */}
              <HeaderFavoritesLink locale={locale} />

              {/* 🛡️ MOBİL TEKLİF AL — eski görünür "Menü" yazısının
                 yerini aldı. Hamburger toggle'dan TAMAMEN bağımsız ayrı
                 bir <Link>; kendi tıklama alanı var, hamburger'ın
                 onClick'ini tetiklemez, `open` state'ine dokunmaz.
                 /teklif-al'a gider. Konum/boyut/davranış AYNEN korundu —
                 yalnızca animasyon tekniği değişti: TopBar shimmer (ışık
                 bandı) yerine, desktop CTA ile AYNI breathing/pulse glow
                 (bkz. `renderTeklifAlDesktop` yorumu). `shrink-0` artık
                 sarmalayıcı `div` üzerinde → küçük ekranlarda taşma/
                 sıkışma yok. */}
              <div className="group relative shrink-0">
                <span
                  aria-hidden
                  className="
                    pointer-events-none absolute -inset-1 rounded-full
                    bg-gradient-to-r from-[#ED7926] to-[#0973BA]
                    opacity-40 blur-md
                    animate-pulse [animation-duration:2.8s]
                    group-hover:opacity-70 group-hover:blur-lg
                    transition-[opacity,filter] duration-300
                    motion-reduce:animate-none
                  "
                />
                <Link
                  href={localeHref("/teklif-al", locale)}
                  className="
                    relative inline-flex items-center justify-center
                    whitespace-nowrap
                    px-3.5 py-2 rounded-full
                    text-[12px] font-semibold text-white
                    bg-gradient-to-r from-[#ED7926] to-[#0973BA]
                    shadow-[0_4px_14px_-4px_rgba(237,121,38,0.5),0_4px_14px_-4px_rgba(9,115,186,0.4)]
                    active:scale-[0.97]
                    transition-transform duration-150 motion-reduce:transition-none
                    focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#0973BA]/50
                  "
                >
                  {dictionary.header.offer}
                </Link>
              </div>

              {/* HAMBURGER — aç/kapa davranışı birebir korundu. Görünür
                 "Menü" metni kaldırıldı (yerini Teklif Al CTA'sı aldı);
                 yalnız ikon kalır, simetrik padding ile tap alanı korunur.
                 Kapanış (manuel ya da route değişimiyle) submenu state'ini
                 de temizler (closeMobileMenu → openSubmenus sıfırlanır). */}
              <button
                onClick={() => (open ? closeMobileMenu() : setOpen(true))}
                aria-label={open ? dictionary.header.menuClose : dictionary.header.menuOpen}
                aria-expanded={open}
                className="
                  inline-flex items-center justify-center shrink-0
                  p-2.5 rounded-full
                  text-[var(--color-stone-900)]
                  hover:bg-[var(--color-sand-50)]
                  transition-colors motion-reduce:transition-none
                "
              >
                {open ? <X size={22} /> : <Menu size={22} />}
              </button>
            </div>
          </div>
        </div>

        {/* MOBILE MENU */}
        <div
          className={
            "md:hidden bg-white border-t border-[var(--color-stone-100)] shadow-lg " +
            "transition-all duration-300 origin-top " +
            (open
              ? /* 🛡️ MOBİL MENÜ SCROLL FIX — bar (h-[72px]) altından
                   viewport sonuna; dvh → iPhone Safari toolbar-safe.
                   overflow-y-auto: uzun menüde alt öğelere erişim;
                   overscroll-contain: iOS body scroll-chaining engeli. */
                "opacity-100 max-h-[calc(100dvh-72px)] overflow-y-auto overscroll-contain"
              : "opacity-0 max-h-0 overflow-hidden")
          }
        >
          <div className="flex flex-col p-5 gap-4">
            {/* 🛡️ MOBILE SEARCH header strip'e taşındı (kullanıcı
               hamburger açmadan görebilsin). Drawer artık yalnızca
               navigasyon menüsü ve CTA içerir. Aynı state hâlâ
               geçerli — sadece drawer içindeki render kaldırıldı. */}
            {menu.map((item) => {
              const itemKey = item.id || item.name;
              const hasChildren =
                item.children && item.children.length > 0;
              const isSubmenuOpen = openSubmenus.has(itemKey);
              /* 🛡️ PHASE 10H — masaüstüyle AYNI çözüm. `itemKey` bilinçli
                 olarak canonical `item.name`'den türetilmeye devam eder
                 (React key + açık submenu state'i locale değişiminden
                 ETKİLENMEMELİ). */
              const itemName = resolveTaxonomyName(
                item.name,
                item.nameByLocale,
                locale
              );

              return (
                <div
                  key={itemKey}
                  className="border-b border-[var(--color-stone-100)] pb-3 last:border-b-0"
                >
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      href={localeHref(item.href, locale)}
                      className="block flex-1 font-medium text-[var(--color-stone-900)]"
                    >
                      {itemName}
                    </Link>

                    {/* 🛡️ SUBMENU TOGGLE — ayrı, bağımsız tıklama alanı.
                       Parent linkin kendi navigasyon davranışına
                       dokunmaz (yukarıdaki <Link> AYNEN çalışır);
                       yalnızca alt menüyü açar/kapatır. Birden fazla
                       submenu bağımsız açık kalabilir (openSubmenus
                       bir Set — bunu açmak diğerini kapatmaz). */}
                    {hasChildren && (
                      <button
                        type="button"
                        onClick={() => toggleSubmenu(itemKey)}
                        aria-expanded={isSubmenuOpen}
                        aria-label={formatDictionaryString(
                          isSubmenuOpen
                            ? dictionary.header.submenuCloseAriaLabel
                            : dictionary.header.submenuOpenAriaLabel,
                          { label: itemName }
                        )}
                        className="
                          shrink-0 inline-flex items-center justify-center
                          h-7 w-7 rounded-full
                          text-[var(--color-stone-500)]
                          hover:bg-[var(--color-sand-50)] hover:text-[var(--color-stone-900)]
                          transition-colors motion-reduce:transition-none
                          focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0973BA]/40
                        "
                      >
                        <ChevronDown
                          size={16}
                          className={
                            "transition-transform duration-300 motion-reduce:transition-none " +
                            (isSubmenuOpen ? "rotate-180" : "rotate-0")
                          }
                        />
                      </button>
                    )}
                  </div>

                  {/* 🛡️ SMOOTH ACCORDION — grid-rows-[0fr]→[1fr] tekniği
                     (projede FaqSection.tsx ile aynı yaklaşım); height
                     ölçme/layout-thrash yok. Başlangıçta (openSubmenus
                     boş Set) HERKES kapalı. */}
                  {hasChildren && (
                    <div
                      className={
                        "grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none " +
                        (isSubmenuOpen ? "grid-rows-[1fr] mt-2" : "grid-rows-[0fr]")
                      }
                    >
                      <div className="overflow-hidden">
                        <div className="ml-3 space-y-2">
                          {item.children!.map((child) => (
                            <Link
                              key={child.id}
                              href={localeHref(child.href, locale)}
                              className="block text-[16.5px] text-[var(--color-stone-500)] hover:text-[var(--color-stone-900)] transition"
                            >
                              {resolveTaxonomyName(
                                child.name,
                                child.nameByLocale,
                                locale
                              )}
                            </Link>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* 🛡️ Favoriler artık mobil Header strip'te (hamburger'ın
               solunda ikon-only). Drawer içindeki "Favorilerim" satırı
               kaldırıldı. */}

          </div>
        </div>
      </header>

      {/* Spacer — header opak; her sayfada koşulsuz boşluk. */}
      <div className="h-[108px]" />
    </>
  );
}
