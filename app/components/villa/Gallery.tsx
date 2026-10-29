"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import NextImage from "next/image";
import { ChevronLeft, ChevronRight, Play, X } from "lucide-react";
import WatermarkOverlay from "./WatermarkOverlay";
import VillaVideoModal from "./VillaVideoModal";
import type { WatermarkPosition } from "@/app/services/settings.types";
import type { VillaYouTubeVideo } from "@/lib/youtube.helper";
/* 🛡️ PHASE 10B — locale-aware UI stringleri. `locale` opsiyonel,
   default "tr" (getDictionary(undefined) zaten TR'ye düşer) — mevcut
   TR call-site'ları (kiralik-villa/[slug]/page.tsx, v/[token]/page.tsx,
   AdminGallery.tsx) HİÇ DEĞİŞMEDEN, byte-identical render etmeye devam
   eder. Lightbox/swipe/keyboard/video-modal/image-loading mantığına
   DOKUNULMADI — yalnız UI string kaynağı değişti. */
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { formatDictionaryString } from "@/lib/i18n/format-dictionary-string";
import type { Locale } from "@/lib/i18n/config";

type WatermarkProps = {
  logo?: string | null;
  enabled?: boolean | null;
  opacity?: number | null;
  position?: WatermarkPosition | null;
  size?: number | null;
};

/* 🛡️ SEO + a11y ALT TEXT — villa.title + image index pattern.
   Cover (index 0) için "kapak fotoğrafı"; diğerleri için sıra numarası.
   Schema.org image SEO ve screen-reader uyumu için. DB'de alt_text
   kolonu yok; auto-generation yeterli. Custom alt_text ileride DB
   eklenirse bu helper'ı override edebilir.

   `villaTitle` opsiyonel — verilmezse generic "Villa" fallback,
   eski kullanım davranışı aynen korunur (geriye dönük uyum). */
function buildImageAlt(
  villaTitle: string | undefined | null,
  index: number,
  total: number,
  dict: ReturnType<typeof getDictionary>
): string {
  const t = (villaTitle || "Villa").trim();
  if (index === 0) {
    return formatDictionaryString(dict.gallery.coverPhotoAlt, { title: t });
  }
  if (total > 1) {
    return formatDictionaryString(dict.gallery.photoAltWithTotal, {
      title: t,
      index: index + 1,
      total,
    });
  }
  return formatDictionaryString(dict.gallery.photoAlt, {
    title: t,
    index: index + 1,
  });
}

export default function Gallery({
  images,
  watermark,
  villaTitle,
  videos,
  actions,
  locale,
}: {
  images: string[];
  watermark?: WatermarkProps;
  /** 🛡️ SEO + a11y: alt text auto-generation için. Opsiyonel; eski
   *  caller'lar (yoksa) "Villa" generic fallback'a düşer. */
  villaTitle?: string;
  /* 🛡️ VillaInfoBar'dan taşındı (yalnız DOM konumu) — hero görselinin
     sol üst köşesinde overlay olarak render edilir. Video listesi boş/
     undefined ise CTA görünmez; mevcut VillaVideoModal AYNEN tüketiliyor. */
  videos?: VillaYouTubeVideo[] | null;
  /* 🛡️ VillaInfoBar'dan taşındı — Favori/Paylaş gibi caller-controlled
     aksiyon slotu (FavoriteButton). Logic'e ASLA dokunulmaz, yalnız DOM
     konumu. Opsiyonel — verilmezse hiçbir aksiyon görünmez. */
  actions?: ReactNode;
  /* 🛡️ PHASE 10B — opsiyonel, default "tr" (getDictionary(undefined)).
     TR call-site'ları bu prop'u hiç geçmeden BYTE-IDENTICAL çalışır. */
  locale?: Locale;
}) {
  const dict = getDictionary(locale);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [videoOpen, setVideoOpen] = useState(false);
  const safeVideos = videos ?? [];
  const hasVideo = safeVideos.length > 0;

  /* 🛡️ LIGHTBOX — tam ekrana yakın görüntüleyici (durum + yardımcılar)
     ===============================================================
     - `isOpen` yalnız açık/kapalı geçişlerinde değişir; açık kalırken
       foto değişimi (activeIndex) kilit/odak efektlerini YENİDEN
       çalıştırmaz.
     - `returnFocusRef`: galeriyi açan öğe (kolaj karesi / "Tüm
       Fotoğraflar"); kapanınca odak buraya döner. */
  const isOpen = activeIndex !== null;
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  /* Aşağı kaydırarak kapatma sırasında taşınan foto katmanı. */
  const dragLayerRef = useRef<HTMLDivElement | null>(null);

  /* 🛡️ THUMBNAIL FILMSTRIP — lightbox aktif thumbnail referansları.
     scrollIntoView ile aktif thumb görünür alanda tutulur. Yalnız
     lightbox açıkken render edilir → LCP etkisi yok. */
  const thumbRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function openAt(index: number, opener?: HTMLElement | null) {
    returnFocusRef.current =
      opener ??
      (typeof document !== "undefined"
        ? (document.activeElement as HTMLElement | null)
        : null);
    setActiveIndex(index);
  }

  function close() {
    setActiveIndex(null);
  }

  function next() {
    setActiveIndex((prev) =>
      prev !== null ? (prev + 1) % images.length : prev
    );
  }

  function prev() {
    setActiveIndex((prev) =>
      prev !== null ? (prev - 1 + images.length) % images.length : prev
    );
  }

  /* 🔒 KAYDIRMA KİLİDİ — yalnız lightbox AÇIKKEN. `body` ve `html`
     overflow değerleri kaydedilir ve kapanınca/unmount'ta AYNEN geri
     yüklenir (video/harita modal'larındaki desenle aynı; mount'ta
     `overflow: auto` YAZILMAZ). */
  useEffect(() => {
    if (!isOpen) return;
    const body = document.body;
    const html = document.documentElement;
    const prevBody = body.style.overflow;
    const prevHtml = html.style.overflow;
    body.style.overflow = "hidden";
    html.style.overflow = "hidden";
    return () => {
      body.style.overflow = prevBody;
      html.style.overflow = prevHtml;
    };
  }, [isOpen]);

  /* 🎯 ODAK — açılınca kapatma düğmesine; kapanınca açan öğeye. */
  useEffect(() => {
    if (!isOpen) return;
    closeButtonRef.current?.focus({ preventScroll: true });
    return () => {
      const el = returnFocusRef.current;
      returnFocusRef.current = null;
      if (el && typeof el.focus === "function" && document.contains(el)) {
        el.focus({ preventScroll: true });
      }
    };
  }, [isOpen]);

  /* ⌨️ KLAVYE — dinleyici YALNIZ lightbox açıkken bağlı (kapalıyken ok
     tuşları galeriyi AÇMAZ, sayfadaki kontrollere karışmaz). Form
     alanlarında / düzenlenebilir içerikte kısayollar çalışmaz. Tab
     odağı dialog içinde tutulur. */
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isTyping =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        !!target?.isContentEditable;

      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === "Tab") {
        const root = dialogRef.current;
        if (!root) return;
        const focusables = Array.from(
          root.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
          )
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;
        const inside = !!active && root.contains(active);
        if (e.shiftKey && (active === first || !inside)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (active === last || !inside)) {
          e.preventDefault();
          first.focus();
        }
        return;
      }
      if (isTyping) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      }
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, images.length]);

  /* 🛡️ Aktif thumbnail'i görünür alana kaydır (lightbox açılışında +
     her next/prev/klavye/swipe navigasyonunda). Sayfa scroll-lock
     olduğundan block:"nearest" dış scroll tetiklemez; inline:"center"
     yatay şeridi ortalar. */
  useEffect(() => {
    if (activeIndex === null) return;
    const el = thumbRefs.current[activeIndex];
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({
        behavior: "smooth",
        inline: "center",
        block: "nearest",
      });
    }
  }, [activeIndex]);

  /* ⚡ ÖN YÜKLEME — sonraki/önceki fotoğraf tarayıcı önbelleğine alınır
     (mevcut görsel altyapısı; yeni sistem YOK). */
  useEffect(() => {
    if (activeIndex === null || images.length < 2) return;
    if (typeof window === "undefined" || typeof window.Image !== "function") return;
    const neighbours = new Set([
      (activeIndex + 1) % images.length,
      (activeIndex - 1 + images.length) % images.length,
    ]);
    neighbours.forEach((i) => {
      if (i === activeIndex || !images[i]) return;
      const img = new window.Image();
      img.decoding = "async";
      img.src = images[i];
    });
  }, [activeIndex, images]);

  /* 🛡️ DOKUNMATİK — sağa/sola kaydırma ile foto değiştirme + aşağı
     kaydırarak kapatma. Eksen, hareketin ilk ~10px'inde KİLİTLENİR;
     yatay hareket asla kapatmayı, dikey hareket asla foto değişimini
     tetiklemez. Çoklu parmak (pinch) hareketi iptal eder. Kapatma için
     belirgin bir aşağı hareket gerekir (CLOSE_THRESHOLD). */
  const SWIPE_THRESHOLD = 50;
  const CLOSE_THRESHOLD = 120;
  const AXIS_LOCK = 10;
  const gestureRef = useRef<{
    x: number;
    y: number;
    axis: "x" | "y" | null;
  } | null>(null);

  function resetDrag() {
    const layer = dragLayerRef.current;
    if (layer) {
      layer.style.transform = "";
      layer.style.transition = "";
    }
    const dialog = dialogRef.current;
    if (dialog) dialog.style.backgroundColor = "";
  }

  function applyDrag(dy: number) {
    const layer = dragLayerRef.current;
    if (layer) {
      layer.style.transition = "none";
      layer.style.transform = `translate3d(0, ${dy}px, 0)`;
    }
    const dialog = dialogRef.current;
    if (dialog) {
      const alpha = Math.max(0.55, 0.95 - dy / 600);
      dialog.style.backgroundColor = `rgba(0, 0, 0, ${alpha})`;
    }
  }

  function handleTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    if (e.touches.length !== 1) {
      gestureRef.current = null;
      resetDrag();
      return;
    }
    gestureRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      axis: null,
    };
  }

  function handleTouchMove(e: React.TouchEvent<HTMLDivElement>) {
    const g = gestureRef.current;
    if (!g) return;
    if (e.touches.length !== 1) {
      gestureRef.current = null;
      resetDrag();
      return;
    }
    const dx = e.touches[0].clientX - g.x;
    const dy = e.touches[0].clientY - g.y;
    if (!g.axis) {
      if (Math.abs(dx) < AXIS_LOCK && Math.abs(dy) < AXIS_LOCK) return;
      g.axis = Math.abs(dy) > Math.abs(dx) * 1.2 ? "y" : "x";
    }
    if (g.axis === "y") applyDrag(Math.max(0, dy));
  }

  function handleTouchEnd(e: React.TouchEvent<HTMLDivElement>) {
    const g = gestureRef.current;
    gestureRef.current = null;
    if (!g) return;
    const t = e.changedTouches[0];
    if (!t) {
      resetDrag();
      return;
    }
    const dx = t.clientX - g.x;
    const dy = t.clientY - g.y;
    const axis =
      g.axis ??
      (Math.abs(dx) >= Math.abs(dy) ? "x" : Math.abs(dy) > Math.abs(dx) * 1.2 ? "y" : null);

    if (axis === "y") {
      resetDrag();
      if (dy >= CLOSE_THRESHOLD) close();
      return;
    }
    resetDrag();
    if (axis === "x" && Math.abs(dx) >= SWIPE_THRESHOLD) {
      if (dx < 0) next();
      else prev();
    }
  }

  function handleTouchCancel() {
    gestureRef.current = null;
    resetDrag();
  }

  /* Kolaj kareleri — klavyeyle de açılabilir (Enter / Space); odak
     kapanınca bu kareye döner. Görünüm DEĞİŞMEDİ. */
  function handleTileKeyDown(
    e: React.KeyboardEvent<HTMLDivElement>,
    index: number
  ) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openAt(index, e.currentTarget);
    }
  }


  if (!images || images.length === 0) {
    return (
      <div className="h-64 bg-gray-800 rounded-xl flex items-center justify-center">
        {dict.gallery.noImages}
      </div>
    );
  }

  return (
    <>
      <div className="relative">
        {/* 🛡️ VIDEO CTA + FAVORİ — hero'nun SOL ÜST köşesinde overlay.
            VillaInfoBar'dan taşındı; logic AYNEN (video modal aç/kapa,
            FavoriteButton/useFavorites), yalnız DOM konumu değişti.
            Gallery'nin lightbox/swipe/sayaç davranışına sıfır etkisi
            var — "Tüm Fotoğraflar" butonuyla aynı overlay dili
            (absolute + z-10) kullanılıyor, karşı köşede. */}
        {(actions || hasVideo) && (
          <div className="absolute top-3 left-3 md:top-4 md:left-4 z-10 flex items-center gap-2">
            {hasVideo && (
              <button
                type="button"
                onClick={() => setVideoOpen(true)}
                aria-label={
                  villaTitle
                    ? formatDictionaryString(
                        dict.gallery.playVideoAriaLabelWithTitle,
                        { title: villaTitle }
                      )
                    : dict.gallery.playVideoAriaLabel
                }
                className="
                  group/video
                  inline-flex items-center gap-2.5
                  pl-2 pr-5 py-2
                  rounded-full
                  bg-[var(--color-stone-900)] hover:bg-[var(--color-stone-800)]
                  text-white text-[13px] font-semibold tracking-wide
                  shadow-[0_10px_24px_-8px_rgb(27_26_23/0.5)]
                  hover:shadow-[0_14px_28px_-8px_rgb(27_26_23/0.55)]
                  transition-all duration-200 motion-reduce:transition-none
                  hover:-translate-y-[1px] motion-reduce:hover:translate-y-0
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0973BA]/40
                "
              >
                <span
                  aria-hidden
                  className="
                    relative inline-flex items-center justify-center
                    w-7 h-7 rounded-full
                    bg-white text-[var(--color-stone-900)]
                    shadow-[inset_0_0_0_1px_rgba(0,0,0,0.05)]
                  "
                >
                  <Play
                    size={12}
                    strokeWidth={1.8}
                    fill="currentColor"
                    className="ml-0.5"
                  />
                </span>
                <span className="whitespace-nowrap">{dict.gallery.playVideo}</span>
              </button>
            )}
            {actions}
          </div>
        )}

        {/* 🛡️ MOBILE (<768px) — büyük hero + iki secondary; küçültülmüş
           desktop grid DEĞİL, kendine özgü kompozisyon. Tüm tıklamalar
           mevcut lightbox'ı tetikler (setActiveIndex); watermark her
           karede AYNEN. */}
        <div className="grid md:hidden gap-2.5">
          <div
            className="group relative overflow-hidden rounded-[22px] cursor-pointer aspect-[4/3]"
            role="button"
            tabIndex={0}
            onClick={(e) => openAt(0, e.currentTarget)}
            onKeyDown={(e) => handleTileKeyDown(e, 0)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={images[0]}
              alt={buildImageAlt(villaTitle, 0, images.length, dict)}
              className="w-full h-full object-cover transition-transform duration-500 ease-out group-active:scale-[1.03]"
            />
            <WatermarkOverlay {...watermark} />
          </div>

          {images.length >= 2 && (
            <div className="grid grid-cols-2 gap-2.5">
              <div
                className="group relative overflow-hidden rounded-[16px] cursor-pointer aspect-[4/3]"
                role="button"
                tabIndex={0}
                onClick={(e) => openAt(1, e.currentTarget)}
                onKeyDown={(e) => handleTileKeyDown(e, 1)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={images[1]}
                  alt={buildImageAlt(villaTitle, 1, images.length, dict)}
                  className="w-full h-full object-cover transition-transform duration-500 ease-out group-active:scale-[1.03]"
                />
                <WatermarkOverlay {...watermark} />
              </div>

              {images.length >= 3 && (
                <div
                  className="group relative overflow-hidden rounded-[16px] cursor-pointer aspect-[4/3]"
                  role="button"
                  tabIndex={0}
                  onClick={(e) => openAt(2, e.currentTarget)}
                  onKeyDown={(e) => handleTileKeyDown(e, 2)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={images[2]}
                    alt={buildImageAlt(villaTitle, 2, images.length, dict)}
                    className="w-full h-full object-cover transition-transform duration-500 ease-out group-active:scale-[1.03]"
                  />
                  <WatermarkOverlay {...watermark} />
                </div>
              )}
            </div>
          )}
        </div>

        {/* 🔥 DESKTOP (≥768px) — editorial asimetrik kompozisyon: dominant
           hero (~2/3 genişlik) + sağda üst/alt iki secondary görsel.
           Eski 4-kolon masonry KALDIRILDI. Tüm tıklamalar mevcut
           lightbox'ı tetikler; watermark her karede AYNEN. */}
        <div className="hidden md:grid grid-cols-3 grid-rows-2 gap-3 h-[440px] lg:h-[500px]">
          {/* HERO — ana görsel, dominant */}
          <div
            className={
              "group relative overflow-hidden rounded-[28px] cursor-pointer " +
              (images.length >= 2
                ? "col-span-2 row-span-2"
                : "col-span-3 row-span-2")
            }
            role="button"
            tabIndex={0}
            onClick={(e) => openAt(0, e.currentTarget)}
            onKeyDown={(e) => handleTileKeyDown(e, 0)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={images[0]}
              alt={buildImageAlt(villaTitle, 0, images.length, dict)}
              className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
            />
            <WatermarkOverlay {...watermark} />
          </div>

          {/* SECONDARY 1 — sağ üst (veya foto sayısı 2 ise sağ kolonun tamamı) */}
          {images.length >= 2 && (
            <div
              className={
                "group relative overflow-hidden rounded-2xl cursor-pointer col-start-3 " +
                (images.length >= 3 ? "row-start-1" : "row-span-2")
              }
              role="button"
              tabIndex={0}
              onClick={(e) => openAt(1, e.currentTarget)}
              onKeyDown={(e) => handleTileKeyDown(e, 1)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={images[1]}
                alt={buildImageAlt(villaTitle, 1, images.length, dict)}
                className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
              />
              <WatermarkOverlay {...watermark} />
            </div>
          )}

          {/* SECONDARY 2 — sağ alt */}
          {images.length >= 3 && (
            <div
              className="group relative overflow-hidden rounded-2xl cursor-pointer col-start-3 row-start-2"
              role="button"
              tabIndex={0}
              onClick={(e) => openAt(2, e.currentTarget)}
              onKeyDown={(e) => handleTileKeyDown(e, 2)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={images[2]}
                alt={buildImageAlt(villaTitle, 2, images.length, dict)}
                className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
              />
              <WatermarkOverlay {...watermark} />
            </div>
          )}
        </div>

        {/* 🛡️ TÜM FOTOĞRAFLAR — floating control, galeri köşesinde modern
           bir giriş noktası. Mevcut lightbox'ı index 0'dan açar; davranış
           AYNEN (yalnız yeni, görünür bir tetikleyici). Gerçek fotoğraf
           sayısı kullanılır — FAKE sayı YOK. Yalnızca collage'da
           görünenden fazlası varsa (>3) render edilir. */}
        {images.length > 3 && (
          <button
            type="button"
            onClick={(e) => openAt(0, e.currentTarget)}
            aria-label={formatDictionaryString(
              dict.gallery.viewAllPhotosAriaLabel,
              { count: images.length }
            )}
            className="
              absolute bottom-3 right-3 md:bottom-4 md:right-4 z-10
              inline-flex items-center gap-1.5
              rounded-full bg-white/95 backdrop-blur-sm
              px-3.5 py-2
              text-[12.5px] font-semibold text-[var(--color-stone-800)]
              ring-1 ring-black/5
              shadow-[0_8px_20px_-8px_rgba(11,31,58,0.35)]
              hover:bg-white transition-colors duration-200 motion-reduce:transition-none
              focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0973BA]/50
            "
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
              <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
              <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
              <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
            </svg>
            {formatDictionaryString(dict.gallery.viewAllPhotos, {
              count: images.length,
            })}
          </button>
        )}
      </div>

      {/* 🔥 LIGHTBOX — TAM EKRANA YAKIN GÖRÜNTÜLEYİCİ
          ===============================================================
          • SABİT SAHNE: dialog tüm kullanılabilir ekranı (100dvh +
            safe-area) kaplar; üst çubuk (sayaç + kapat), sahne ve alt
            küçük resim şeridi SABİT yüksekliktedir → foto değişince
            hiçbir kontrol yer değiştirmez (a47ae2f'teki "zıplama"
            sorunu geri gelmez).
          • KIRPMA YOK: foto `object-contain` mantığıyla sahneye sığdırılır
            (max-width/max-height, en-boy oranı korunur).
          • FİLİGRAN: fotoğrafın KENDİ boyutundaki sarmalayıcıya bağlı →
            boş koyu alana taşmaz, konum/boyut fotoğrafa göre (%) kalır.
          • Masaüstünde ve kısa (yatay telefon) ekranlarda üst çubuk
            sahnenin üstüne biner; foto için yükseklik kazanılır.
          • Ölçüler CSS değişkenleriyle: --gl-chrome (fotoğrafın dikeyde
            paylaşmadığı yükseklik: mobil üst çubuk 48 + şerit 56, md+ ve
            kısa ekranda yalnız şerit 56/68), --gl-gutter (masaüstünde
            ‹ › için yan pay). */}
      {activeIndex !== null && (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="villa-gallery-dialog-title"
          className="
            fixed inset-0 z-[1100] flex h-[100dvh] w-full flex-col
            bg-black/95 text-white
            pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]
            pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]
            [--gl-chrome:104px] [--gl-gutter:0px]
            md:[--gl-chrome:68px] md:[--gl-gutter:144px]
            [@media(max-height:500px)]:[--gl-chrome:56px]
          "
        >
          <h2 id="villa-gallery-dialog-title" className="sr-only">
            {villaTitle
              ? formatDictionaryString(dict.gallery.lightboxTitleWithTitle, {
                  title: villaTitle,
                })
              : dict.gallery.lightboxTitle}
          </h2>

          {/* ÜST ÇUBUK — sayaç + kapat. Mobil dikey kullanımda kendi
              satırındadır; masaüstünde (md+) ve kısa ekranlarda sahnenin
              üstüne hafif bir gradyanla biner. Yeri her durumda SABİT. */}
          <div
            className="
              relative z-20 flex h-12 shrink-0 items-center justify-between px-3
              md:absolute md:inset-x-0 md:top-[env(safe-area-inset-top)]
              md:h-14 md:px-5
              md:bg-gradient-to-b md:from-black/50 md:to-transparent
              [@media(max-height:500px)]:absolute
              [@media(max-height:500px)]:inset-x-0
              [@media(max-height:500px)]:top-[env(safe-area-inset-top)]
              [@media(max-height:500px)]:bg-gradient-to-b
              [@media(max-height:500px)]:from-black/60
              [@media(max-height:500px)]:to-transparent
            "
          >
            <p
              aria-hidden="true"
              className="rounded-full bg-black/45 px-3 py-1 text-[13px] font-medium tabular-nums text-white ring-1 ring-white/15"
            >
              {activeIndex + 1} / {images.length}
            </p>
            <p className="sr-only" aria-live="polite" aria-atomic="true">
              {formatDictionaryString(dict.gallery.photoCounterAriaLabel, {
                index: activeIndex + 1,
                total: images.length,
              })}
            </p>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={close}
              aria-label={dict.gallery.closeGalleryAriaLabel}
              className="
                inline-flex h-11 w-11 items-center justify-center rounded-full
                bg-black/50 text-white ring-1 ring-white/25 backdrop-blur-sm
                transition-colors hover:bg-black/70
                focus:outline-none focus-visible:ring-2 focus-visible:ring-white
              "
            >
              <X size={20} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>

          {/* SAHNE — sabit alan. Boş alana tıklama kapatır; foto ve
              butonlar kapatmaz. Dokunmatik: yatay kaydırma = foto
              değiştir, aşağı kaydırma = kapat. `touch-action:
              pinch-zoom` → tarayıcı yakınlaştırması açık, sayfa kaymaz. */}
          <div
            className="relative min-h-0 flex-1 [touch-action:pinch-zoom]"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchCancel}
          >
            <div
              ref={dragLayerRef}
              className="absolute inset-0 flex items-center justify-center transition-transform duration-200 ease-out"
              onClick={(e) => {
                if (e.target === e.currentTarget) close();
              }}
            >
              {/* Foto boyutlu sarmalayıcı — filigran fotoğrafa bağlı. */}
              <div className="relative overflow-hidden leading-[0]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={images[activeIndex]}
                  alt={buildImageAlt(villaTitle, activeIndex, images.length, dict)}
                  decoding="async"
                  draggable={false}
                  className="block h-auto w-auto select-none object-contain"
                  style={{
                    maxWidth:
                      "calc(100vw - env(safe-area-inset-left) - env(safe-area-inset-right) - var(--gl-gutter))",
                    maxHeight:
                      "calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - var(--gl-chrome))",
                  }}
                />
                <WatermarkOverlay {...watermark} />
              </div>
            </div>

            {images.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={prev}
                  aria-label={dict.gallery.prevPhotoAriaLabel}
                  className="
                    absolute left-2 top-1/2 z-10 -translate-y-1/2
                    inline-flex h-11 w-11 items-center justify-center rounded-full
                    bg-black/45 text-white ring-1 ring-white/25 backdrop-blur-sm
                    shadow-[0_4px_16px_rgba(0,0,0,0.35)]
                    transition-colors hover:bg-black/70
                    focus:outline-none focus-visible:ring-2 focus-visible:ring-white
                    md:left-4 md:h-12 md:w-12
                  "
                >
                  <ChevronLeft size={24} strokeWidth={2} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={next}
                  aria-label={dict.gallery.nextPhotoAriaLabel}
                  className="
                    absolute right-2 top-1/2 z-10 -translate-y-1/2
                    inline-flex h-11 w-11 items-center justify-center rounded-full
                    bg-black/45 text-white ring-1 ring-white/25 backdrop-blur-sm
                    shadow-[0_4px_16px_rgba(0,0,0,0.35)]
                    transition-colors hover:bg-black/70
                    focus:outline-none focus-visible:ring-2 focus-visible:ring-white
                    md:right-4 md:h-12 md:w-12
                  "
                >
                  <ChevronRight size={24} strokeWidth={2} aria-hidden="true" />
                </button>
              </>
            )}
          </div>

          {/* 🛡️ THUMBNAIL ŞERİDİ — kompakt (mobil 44px, md+ 56px, kısa
              ekranda 44px). Yatay kaydırılır; seçili küçük resim beyaz
              halka + tam opaklıkla ayırt edilir. Küçük resimler mevcut
              next/image altyapısıyla (VillaCard ile aynı remotePatterns)
              küçük boyutta istenir; hata olursa ham görsele düşer. */}
          <div
            className="shrink-0 overflow-x-auto py-1.5"
            aria-label={dict.gallery.thumbnailsAriaLabel}
            role="group"
          >
            <div className="mx-auto flex w-max gap-1.5 px-3 md:gap-2">
              {images.map((src, i) => (
                <button
                  key={i}
                  type="button"
                  ref={(el) => {
                    thumbRefs.current[i] = el;
                  }}
                  onClick={() => setActiveIndex(i)}
                  aria-label={formatDictionaryString(
                    dict.gallery.photoAriaLabel,
                    { index: i + 1 }
                  )}
                  aria-current={i === activeIndex ? "true" : undefined}
                  className={
                    "relative h-11 w-16 shrink-0 overflow-hidden rounded-md ring-2 transition " +
                    "md:h-14 md:w-20 [@media(max-height:500px)]:h-11 [@media(max-height:500px)]:w-16 " +
                    "focus:outline-none focus-visible:ring-white " +
                    (i === activeIndex
                      ? "ring-white opacity-100"
                      : "ring-transparent opacity-55 hover:opacity-100")
                  }
                >
                  <GalleryThumb src={src} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* VIDEO MODAL — local state. isOpen=false iken iframe yok.
          VillaInfoBar'dan taşındı; logic AYNEN. */}
      {hasVideo && (
        <VillaVideoModal
          isOpen={videoOpen}
          onClose={() => setVideoOpen(false)}
          videos={safeVideos}
          villaTitle={villaTitle}
          locale={locale}
        />
      )}
    </>
  );
}

/* 🛡️ KÜÇÜK RESİM — mevcut next/image altyapısı (VillaCard ile aynı
   remotePatterns) küçük boyut ister; optimizasyon hata verirse ham
   görsele düşer (davranış eskisi gibi). Yeni thumbnail üretimi YOK. */
function GalleryThumb({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        className="h-full w-full object-cover"
      />
    );
  }
  return (
    <NextImage
      src={src}
      alt=""
      fill
      sizes="(min-width: 768px) 80px, 64px"
      loading="lazy"
      draggable={false}
      onError={() => setFailed(true)}
      className="object-cover"
    />
  );
}
