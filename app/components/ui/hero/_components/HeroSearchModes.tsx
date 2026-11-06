"use client";

import {
  useCallback,
  useId,
  useState,
  type ComponentType,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { CalendarDays, Sparkles } from "lucide-react";

import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";

import type { HeroAiSearchProps } from "./HeroAiSearch";

/* ===============================================================
   🛡️ HERO ARAMA MODLARI — "Tarihle Ara" | "Yapay Zekâ ile Ara"
   ===============================================================
   • "Tarihle Ara" paneli (HeroSearchPanel) bu bileşene `children`
     olarak, Hero (server) tarafından AYNEN verilir. Bu dosya o panelin
     içeriğine, state'ine, URL üretimine HİÇ dokunmaz; yalnız üstüne bir
     sekme çubuğu ekler ve AI modunda paneli `hidden` ile gizler
     (unmount edilmez → kullanıcının seçimleri ve datepicker korunur).
   • Panelin kökündeki `mt-12 md:mt-16` boşluğu sekme çubuğuna taşınır;
     panel dosyası değiştirilmeden `[&>.hero-panel-in]:!mt-0` ile.
   • "Yapay Zekâ ile Ara" sekmesi ayrı, premium bir görünüme sahiptir
     (akan gradient çerçeve, nefes alan glow, ışık şeridi, parıldayan
     ikon). "Tarihle Ara" sekmesi `tabClass` ile eski görünümündedir.
   • AI paneli (ayrıştırıcı + sözlük + zod) yalnız sekmeye niyet
     edildiğinde (`hover/focus/click`) `import()` ile yüklenir → ana
     sayfanın ilk JS yükü artmaz (VillaCard 7C ile aynı desen).
   =============================================================== */

type Mode = "date" | "ai";

export default function HeroSearchModes({
  locale = DEFAULT_LOCALE,
  children,
}: {
  locale?: Locale;
  children: ReactNode;
}) {
  const dict = getDictionary(locale).home.aiSearch;
  const uid = useId();
  const [mode, setMode] = useState<Mode>("date");
  const [aiOpened, setAiOpened] = useState(false);
  const [AiPanel, setAiPanel] = useState<ComponentType<HeroAiSearchProps> | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const loadAi = useCallback(() => {
    if (AiPanel) return;
    import("./HeroAiSearch")
      .then((m) => setAiPanel(() => m.default))
      .catch(() => setLoadFailed(true));
  }, [AiPanel]);

  const select = (next: Mode) => {
    if (next === "ai") {
      loadAi();
      setAiOpened(true);
    }
    setMode(next);
  };

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const next: Mode = mode === "date" ? "ai" : "date";
      select(next);
      const el = document.getElementById(`${uid}-tab-${next}`);
      el?.focus();
    }
  };

  const tabClass = (active: boolean) =>
    [
      "inline-flex flex-1 md:flex-none items-center justify-center gap-2",
      "min-h-11 rounded-full px-4 md:px-5 py-2.5",
      "text-[13.5px] font-medium tracking-[0.01em] whitespace-nowrap",
      "transition-colors duration-200 motion-reduce:transition-none",
      "focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
      active
        ? "bg-white text-[var(--color-stone-900)] shadow-[0_10px_24px_-12px_rgba(11,31,58,0.45)]"
        : "bg-white/12 text-white border border-white/30 backdrop-blur-md hover:bg-white/20",
    ].join(" ");

  return (
    <div className="relative mt-12 md:mt-16">
      <div
        role="tablist"
        aria-label={dict.tabsAriaLabel}
        className="mb-3 flex w-full gap-2 md:w-auto"
      >
        <button
          type="button"
          role="tab"
          id={`${uid}-tab-date`}
          aria-selected={mode === "date"}
          aria-controls={`${uid}-panel-date`}
          tabIndex={mode === "date" ? 0 : -1}
          onClick={() => select("date")}
          onKeyDown={onTabKey}
          className={tabClass(mode === "date")}
        >
          <CalendarDays size={16} aria-hidden />
          {dict.tabDate}
        </button>
        {/* ✨ "Yapay Zekâ ile Ara" — premium sekme (yalnız görsel).
            Katmanlar: nefes alan bulanık glow · akan gradient çerçeve ·
            iç yüzey (pasif: koyu cam / aktif: beyaz) · ara ara geçen ince
            ışık şeridi · parıldayan Sparkles ikonu. Animasyonlar aşağıdaki
            yerel <style> bloğunda; prefers-reduced-motion'da durur. */}
        <button
          type="button"
          role="tab"
          id={`${uid}-tab-ai`}
          aria-selected={mode === "ai"}
          aria-controls={`${uid}-panel-ai`}
          tabIndex={mode === "ai" ? 0 : -1}
          onClick={() => select("ai")}
          onMouseEnter={loadAi}
          onFocus={loadAi}
          onKeyDown={onTabKey}
          data-active={mode === "ai" ? "true" : "false"}
          className="hero-ai-tab group relative isolate inline-flex min-h-11 flex-1 rounded-full p-[1.5px] transition-transform duration-300 hover:-translate-y-[1px] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent motion-reduce:transition-none motion-reduce:hover:translate-y-0 md:flex-none"
        >
          <span
            aria-hidden
            className="hero-ai-glow hero-ai-flow pointer-events-none absolute -inset-1.5 -z-10 rounded-full blur-md"
          />
          <span aria-hidden className="hero-ai-flow pointer-events-none absolute inset-0 rounded-full" />
          <span
            className={[
              "relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-full",
              "px-4 py-2.5 text-[13.5px] font-semibold tracking-[0.01em] whitespace-nowrap md:px-5",
              "transition-colors duration-300 motion-reduce:transition-none",
              mode === "ai"
                ? "bg-white text-[var(--color-stone-900)] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]"
                : "bg-[#0b1b3a]/70 text-white backdrop-blur-md group-hover:bg-[#0b1b3a]/60",
            ].join(" ")}
          >
            <span
              aria-hidden
              className="hero-ai-shimmer pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/35 to-transparent"
            />
            <span className="relative inline-flex shrink-0">
              <span
                aria-hidden
                className="hero-ai-icon-glow absolute -inset-1 rounded-full bg-[#F7B267]/45 blur-[6px]"
              />
              <Sparkles size={16} aria-hidden className="hero-ai-twinkle relative text-[#F59A4A]" />
            </span>
            <span className={mode === "ai" ? "hero-ai-text hero-ai-flow relative" : "relative"}>
              {dict.tabAi}
            </span>
          </span>
        </button>
      </div>
      <style>{`
        .hero-ai-tab { --ai-glow-min: 0.28; --ai-glow-max: 0.55; }
        .hero-ai-tab[data-active="true"] { --ai-glow-min: 0.6; --ai-glow-max: 0.95; }
        .hero-ai-flow {
          background-image: linear-gradient(110deg, #ED7926 0%, #F7B267 22%, #0973BA 50%, #7FA8FF 72%, #ED7926 100%);
          background-size: 200% 100%;
          animation: heroAiFlow 8s linear infinite;
        }
        .hero-ai-tab[data-active="true"] .hero-ai-flow { animation-duration: 5s; }
        .hero-ai-text {
          /* Beyaz zeminde okunurluk için daha koyu tonlar (WCAG AA'ya yakın). */
          background-image: linear-gradient(110deg, #C9561A 0%, #B4572A 22%, #0A64A6 50%, #2F55B8 72%, #C9561A 100%);
          -webkit-background-clip: text; background-clip: text; color: transparent;
        }
        .hero-ai-glow {
          opacity: var(--ai-glow-min);
          animation: heroAiFlow 8s linear infinite, heroAiBreathe 3.8s ease-in-out infinite;
          transition: opacity 400ms ease;
        }
        .hero-ai-shimmer { transform: translateX(0) skewX(-20deg); opacity: 0; animation: heroAiShimmer 6.5s ease-in-out infinite; }
        .hero-ai-twinkle { animation: heroAiTwinkle 3.2s ease-in-out infinite; transform-origin: 50% 50%; }
        .hero-ai-icon-glow { opacity: 0.35; animation: heroAiIconGlow 3.2s ease-in-out infinite; }
        @keyframes heroAiFlow { from { background-position: 0% 50%; } to { background-position: 200% 50%; } }
        @keyframes heroAiBreathe {
          0%, 100% { opacity: var(--ai-glow-min); }
          50% { opacity: var(--ai-glow-max); }
        }
        @keyframes heroAiShimmer {
          0% { transform: translateX(0) skewX(-20deg); opacity: 0; }
          8% { opacity: 1; }
          38% { transform: translateX(420%) skewX(-20deg); opacity: 0; }
          100% { transform: translateX(420%) skewX(-20deg); opacity: 0; }
        }
        @keyframes heroAiTwinkle {
          0%, 100% { transform: scale(1) rotate(0deg); }
          50% { transform: scale(1.1) rotate(10deg); }
        }
        @keyframes heroAiIconGlow {
          0%, 100% { opacity: 0.25; transform: scale(0.9); }
          50% { opacity: 0.7; transform: scale(1.15); }
        }
        @media (prefers-reduced-motion: reduce) {
          .hero-ai-flow, .hero-ai-glow, .hero-ai-twinkle, .hero-ai-icon-glow { animation: none; }
          .hero-ai-shimmer { display: none; }
          .hero-ai-glow { opacity: var(--ai-glow-max); }
        }
      `}</style>

      <div
        role="tabpanel"
        id={`${uid}-panel-date`}
        aria-labelledby={`${uid}-tab-date`}
        hidden={mode !== "date"}
        className="[&>.hero-panel-in]:!mt-0"
      >
        {children}
      </div>

      {aiOpened && (
        <div
          role="tabpanel"
          id={`${uid}-panel-ai`}
          aria-labelledby={`${uid}-tab-ai`}
          hidden={mode !== "ai"}
        >
          {AiPanel ? (
            <AiPanel locale={locale} onSwitchToDate={() => select("date")} />
          ) : (
            <div
              role="status"
              className="rounded-2xl border border-white/30 bg-white/30 px-4 py-4 text-[14px] text-white backdrop-blur-xl"
            >
              {loadFailed ? dict.loadError : dict.loading}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
