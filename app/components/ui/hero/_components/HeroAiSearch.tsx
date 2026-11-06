"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Sparkles } from "lucide-react";

import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { todayIstanbulYmd } from "@/lib/date-format";
import { parseNaturalQuery } from "@/lib/ai-search/parse";
import { autoResolve } from "@/lib/ai-search/auto-resolve";
import { ParseResultSchema, TaxonomyResponseSchema } from "@/lib/ai-search/schema";
import { buildVocabulary, type Vocabulary } from "@/lib/ai-search/vocabulary";

import { buildAiSearchHref } from "../_helpers/build-ai-search-query";

/* ===============================================================
   ✨ HERO — "YAPAY ZEKÂ İLE ARA" (KURAL TABANLI, ÜCRETSİZ)
   Doğrudan arama — ara ekran YOK
   ===============================================================
   Kullanıcı metni yazar → "Villa Bul":
     1) Sözlük MEVCUT `GET /api/public/taxonomies` cevabından kurulur
        (zod ile doğrulanır; sayfa ömründe bir kez).
     2) `parseNaturalQuery` metni TARAYICIDA ayrıştırır (harici model /
        API / sunucu çağrısı yok; metin hiçbir yere gönderilmez).
     3) `autoResolve` belirsizlikleri bağlamla, yalnız gerçek taksonomi
        kayıtları arasından ÇÖZER (soru sorulmaz). Desteklenmeyen,
        anlaşılmayan ve geçersiz ifadeler filtreye dönüşmez; tanınan
        diğer kriterlerle aranır. Geçersiz/eksik tarih gönderilmez.
     4) `buildAiSearchHref` → mevcut `buildHeroSearchParams` →
        `localeHref('/arama?…')` (/arama · /en/search · /de/suche) →
        router.push. Onay kartı, özet, soru veya ikinci düğme yok.
   Hiçbir kriter tanınmazsa yönlendirilmez: kısa bir satır + örnekler +
   "Tarihle Ara'ya geç" gösterilir.
   =============================================================== */

export type HeroAiSearchProps = {
  locale?: Locale;
  onSwitchToDate?: () => void;
};

let vocabPromise: Promise<Vocabulary> | null = null;
/** Sözlüğü bir kez yükler (aynı sayfa ömründe tekrar istek atılmaz). */
export function loadAiVocabulary(): Promise<Vocabulary> {
  if (!vocabPromise) {
    vocabPromise = fetch("/api/public/taxonomies")
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((json) => buildVocabulary(TaxonomyResponseSchema.parse(json)))
      .catch((e) => {
        vocabPromise = null;
        throw e;
      });
  }
  return vocabPromise;
}

export default function HeroAiSearch({ locale = DEFAULT_LOCALE, onSwitchToDate }: HeroAiSearchProps) {
  const dict = getDictionary(locale).home.aiSearch;
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"idle" | "working" | "nothing" | "error">("idle");
  const [hint, setHint] = useState<string | null>(null);

  const today = useMemo(() => todayIstanbulYmd(), []);

  const run = async (text: string) => {
    const q = text.trim();
    if (q.length < 2) {
      setHint(dict.emptyQuery);
      return;
    }
    setHint(null);
    setStatus("working");
    try {
      const vocab = await loadAiVocabulary();
      const parsed = ParseResultSchema.parse(parseNaturalQuery(q, vocab, { today, locale }));
      const { criteria, hasCriteria } = autoResolve(parsed, vocab);
      if (!hasCriteria) {
        setStatus("nothing");
        return;
      }
      router.push(buildAiSearchHref(criteria, vocab, locale));
    } catch {
      setStatus("error");
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (status === "working") return;
    void run(query);
  };

  const examples = [dict.example1, dict.example2, dict.example3];
  const working = status === "working";

  return (
    <div className="text-left">
      <form
        onSubmit={onSubmit}
        aria-busy={working}
        className="relative flex flex-col gap-2 rounded-[16px] border border-white/30 bg-gradient-to-b from-white/30 to-white/[0.14] p-2 shadow-[0_20px_50px_-24px_rgba(9,115,186,0.35),0_14px_38px_-26px_rgba(237,121,38,0.3)] backdrop-blur-xl md:flex-row md:items-stretch md:p-2.5"
      >
        {/* Saf beyaz alan: kenarlık ve odak halkası etikette (focus-within);
            textarea'nın global form stilleri (kenarlık, renk, odak gölgesi,
            placeholder) ve global `* { border-color }` kuralı burada
            nötrlenir — globals.css katmansız olduğu için `!` ile. */}
        <label
          className={[
            "group/ai-input flex min-w-0 flex-1 cursor-text items-start gap-3 rounded-xl px-4 py-3",
            "border !border-[#dbe3ee] bg-[#FFFFFF] shadow-[0_1px_2px_rgba(11,31,58,0.06)]",
            "transition-[border-color,box-shadow] duration-200 ease-out motion-reduce:transition-none",
            "hover:not-focus-within:!border-[#9fd3ec]",
            "focus-within:!border-[#02AAE5] focus-within:shadow-[0_0_0_4px_rgba(2,170,229,0.18),0_8px_22px_-10px_rgba(2,170,229,0.45)]",
          ].join(" ")}
        >
          <Sparkles size={18} aria-hidden className="mt-0.5 shrink-0 text-[#ED7926]" />
          <span className="sr-only">{dict.inputLabel}</span>
          <textarea
            value={query}
            rows={1}
            maxLength={300}
            onChange={(e) => {
              setQuery(e.target.value);
              if (status === "nothing" || status === "error") setStatus("idle");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!working) void run(query);
              }
            }}
            placeholder={dict.placeholder}
            aria-describedby="hero-ai-examples"
            className="min-h-[24px] max-h-[96px] w-full resize-none !rounded-none !border-0 !bg-[#FFFFFF] p-0 text-[15px] leading-[1.5] !text-[#0b1f3a] caret-[#02AAE5] placeholder:!text-[#64748b] focus:outline-none focus:!shadow-none [field-sizing:content]"
          />
        </label>
        <button
          type="submit"
          disabled={working}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#ED7926] to-[#0973BA] px-7 py-3.5 text-[14px] font-medium tracking-[0.02em] text-white shadow-[0_20px_44px_-12px_rgba(237,121,38,0.5)] transition-[transform,box-shadow] duration-300 hover:-translate-y-[1px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0973BA]/50 disabled:opacity-70 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
        >
          {working ? dict.parsing : dict.submit}
          <ArrowRight size={16} aria-hidden />
        </button>
      </form>

      {hint && (
        <p role="alert" className="mt-2 rounded-lg bg-white/90 px-3 py-2 text-[13px] text-[#9a3412]">
          {hint}
        </p>
      )}

      {(status === "nothing" || status === "error") && (
        <p
          role="status"
          className="mt-3 rounded-xl border border-white/20 bg-[#0b1b3a]/60 px-3.5 py-2.5 text-[13.5px] text-white backdrop-blur-xl"
        >
          {status === "nothing" ? dict.nothingParsed : dict.loadError}
          {onSwitchToDate && (
            <button
              type="button"
              onClick={onSwitchToDate}
              className="ml-2 font-semibold text-[#F7B267] underline underline-offset-2"
            >
              {dict.switchToDate}
            </button>
          )}
        </p>
      )}

      <div id="hero-ai-examples" className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-medium text-white/90 [text-shadow:0_1px_10px_rgb(0_15_45/50%)]">
          {dict.examplesLabel}
        </span>
        {examples.map((ex) => (
          <button
            key={ex}
            type="button"
            disabled={working}
            onClick={() => {
              setQuery(ex);
              void run(ex);
            }}
            className="max-w-full rounded-full border border-white/40 bg-white/15 px-3.5 py-1.5 text-left text-[13px] text-white backdrop-blur-md transition-colors hover:bg-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-60"
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}
