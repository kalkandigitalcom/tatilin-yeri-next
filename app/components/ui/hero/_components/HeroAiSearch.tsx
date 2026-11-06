"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CalendarDays,
  Check,
  CircleAlert,
  House,
  MapPin,
  Minus,
  Pencil,
  Plus,
  Sparkles,
  Users,
  X,
} from "lucide-react";

import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { formatDictionaryString } from "@/lib/i18n/format-dictionary-string";
import { localeHref } from "@/lib/i18n/locale-href";
import { todayIstanbulYmd } from "@/lib/date-format";
import { parseNaturalQuery } from "@/lib/ai-search/parse";
import {
  ParseResultSchema,
  TaxonomyResponseSchema,
  type ParseChoice,
  type ParseResult,
} from "@/lib/ai-search/schema";
import { buildVocabulary, localizedName, type Vocabulary } from "@/lib/ai-search/vocabulary";

import { buildAiSearchHref } from "../_helpers/build-ai-search-query";

/* ===============================================================
   ✨ HERO — "YAPAY ZEKÂ İLE ARA" (KURAL TABANLI, ÜCRETSİZ)
   B temelli akıllı karma akış
   ===============================================================
   1) Kullanıcı serbest metin yazar (TR/EN/DE). Sözlük MEVCUT
      `GET /api/public/taxonomies` cevabından kurulur (zod). Metin yalnız
      tarayıcıda ayrıştırılır; hiçbir yere gönderilmez/kaydedilmez.
   2) Sonuç büyük bir kart yerine kompakt, koyu cam bir özet satırıdır:
      "✦ Anladığım: [Kaş] [4 kişi] [12–18 Haz] [Deniz Manzaralı] [+]".
      Her çip dokunulunca düzenlenir: masaüstünde popover, mobilde
      alt sayfa (bottom sheet, body'ye portal).
   3) Akıllı yönlendirme:
        • her şey temiz → kısa "Villalar açılıyor…" → mevcut /arama URL'si
          (Düzenle ile iptal edilebilir);
        • seçim gerekiyorsa → YALNIZ o kriter için küçük soru (sırayla);
          tip/özellik çakışması (ısıtmalı kapalı havuz, çocuk oyun alanı)
          OTOMATİK SEÇİLMEZ;
        • tarih belirsiz/geçersiz → "Tarih seç" veya "Tarihsiz ara";
        • desteklenmeyen / anlaşılmayan → küçük uyarı + "Villaları göster"
          (otomatik geçiş YOK: yazılan hiçbir kriter sessizce kaybolmaz);
        • hiçbir şey anlaşılmadı → örnek aramalar + Tarihle Ara'ya geç.
   4) URL üretimi değişmedi: `buildAiSearchHref` → `buildHeroSearchParams`
      → `localeHref('/arama?…')` (/arama · /en/search · /de/suche).
   =============================================================== */

export type HeroAiSearchProps = {
  locale?: Locale;
  onSwitchToDate?: () => void;
};

type Criteria = {
  regionIds: string[];
  typeId: string | null;
  featureIds: string[];
  guests: number | null;
  start: string | null;
  end: string | null;
};

type EditorKind = "region" | "guests" | "date" | "type" | "feature" | "add";
type EditorState = { kind: EditorKind; featureId?: string; fromQuestion?: boolean } | null;

const EMPTY: Criteria = { regionIds: [], typeId: null, featureIds: [], guests: null, start: null, end: null };

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

/** CSS media query'yi izler (SSR/jsdom'da `matchMedia` yoksa false). */
function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, [query]);
  return match;
}

const AUTO_DELAY_MS = 650;
const AUTO_DELAY_REDUCED_MS = 150;

const fieldBase =
  "rounded-lg border border-[var(--color-stone-200)] bg-white px-2.5 py-2 text-[14px] text-[var(--color-stone-900)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0973BA]/40";
const primaryBtn =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#ED7926] to-[#0973BA] px-5 py-2.5 text-[13.5px] font-medium text-white shadow-[0_14px_30px_-14px_rgba(237,121,38,0.6)] transition-[transform,box-shadow] duration-200 hover:-translate-y-[1px] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none motion-reduce:hover:translate-y-0";
const ghostBtn =
  "inline-flex items-center justify-center gap-1.5 rounded-full border border-white/35 bg-white/10 px-3.5 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70";
const optionBtn =
  "rounded-full border border-white/40 bg-white/95 px-3.5 py-1.5 text-[13px] font-medium text-[var(--color-stone-900)] transition-colors hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80";

/* ---------------- Özet çipi ---------------- */
function SummaryChip({
  icon,
  text,
  ariaLabel,
  active,
  onClick,
}: {
  icon: ReactNode;
  text: string;
  ariaLabel: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-ai-keep=""
      aria-label={ariaLabel}
      aria-haspopup="dialog"
      aria-expanded={active}
      onClick={onClick}
      className={[
        "inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium",
        "transition-colors duration-200 motion-reduce:transition-none",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80",
        active
          ? "border-white bg-white text-[var(--color-stone-900)]"
          : "border-white/25 bg-white/10 text-white hover:bg-white/20",
      ].join(" ")}
    >
      <span aria-hidden className={active ? "text-[#ED7926]" : "text-[#F7B267]"}>
        {icon}
      </span>
      <span className="truncate">{text}</span>
    </button>
  );
}

/* ---------------- Düzenleyici kabuğu: popover (masaüstü) / alt sayfa (mobil) ---------------- */
function EditorShell({
  mobile,
  title,
  closeLabel,
  onClose,
  children,
}: {
  mobile: boolean;
  title: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    const onDown = (e: MouseEvent) => {
      if (mobile) return;
      const t = e.target as Element | null;
      if (!ref.current || !t || ref.current.contains(t)) return;
      if (t.closest?.("[data-ai-keep]")) return;
      closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    const first = ref.current?.querySelector<HTMLElement>("select, input, button[data-ai-primary]");
    first?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [mobile]);

  const header = (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h4 className="text-[14px] font-semibold text-[var(--color-stone-900)]">{title}</h4>
      <button
        type="button"
        onClick={onClose}
        aria-label={closeLabel}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-stone-500)] hover:bg-[var(--color-stone-100,#f1f0ee)] hover:text-[var(--color-stone-900)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0973BA]/40"
      >
        <X size={16} aria-hidden />
      </button>
    </div>
  );

  if (mobile) {
    if (typeof document === "undefined") return null;
    return createPortal(
      <div className="fixed inset-0 z-[100] flex items-end" data-ai-sheet="">
        <div aria-hidden className="absolute inset-0 bg-[#0b1b3a]/45 backdrop-blur-[2px]" onClick={onClose} />
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="relative max-h-[82vh] w-full overflow-y-auto rounded-t-[22px] bg-white px-4 pb-[max(18px,env(safe-area-inset-bottom))] pt-2.5 text-left shadow-[0_-18px_44px_-18px_rgba(11,31,58,0.45)]"
        >
          <div aria-hidden className="mx-auto mb-2.5 h-1 w-10 rounded-full bg-[var(--color-stone-200)]" />
          {header}
          {children}
        </div>
      </div>,
      document.body
    );
  }
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={title}
      className="absolute left-0 top-full z-40 mt-2 w-[min(380px,100%)] rounded-2xl border border-[var(--color-stone-100)] bg-white p-4 text-left shadow-[0_24px_54px_-20px_rgba(11,31,58,0.5)]"
    >
      {header}
      {children}
    </div>
  );
}

export default function HeroAiSearch({ locale = DEFAULT_LOCALE, onSwitchToDate }: HeroAiSearchProps) {
  const dict = getDictionary(locale).home.aiSearch;
  const router = useRouter();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const navigatedRef = useRef(false);

  const isMobile = useMediaQuery("(max-width: 767px)");
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "result" | "error">("idle");
  const [hint, setHint] = useState<string | null>(null);
  const [vocab, setVocab] = useState<Vocabulary | null>(null);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [crit, setCrit] = useState<Criteria>(EMPTY);
  const [pending, setPending] = useState<ParseChoice[]>([]);
  const [choiceTotal, setChoiceTotal] = useState(0);
  const [usedSuggestions, setUsedSuggestions] = useState<string[]>([]);
  const [dateSkipped, setDateSkipped] = useState(false);
  /** Otomatik geçiş izni: kullanıcı bir çipi düzenlediğinde/iptal ettiğinde kapanır. */
  const [armed, setArmed] = useState(false);
  const [editor, setEditor] = useState<EditorState>(null);
  const [guestDraft, setGuestDraft] = useState(2);
  const [dateDraft, setDateDraft] = useState<{ start: string; end: string }>({ start: "", end: "" });

  const today = useMemo(() => todayIstanbulYmd(), []);

  const run = async (text: string) => {
    const q = text.trim();
    if (q.length < 2) {
      setHint(dict.emptyQuery);
      return;
    }
    setHint(null);
    setEditor(null);
    setStatus("loading");
    try {
      const v = vocab ?? (await loadAiVocabulary());
      setVocab(v);
      const r = ParseResultSchema.parse(parseNaturalQuery(q, v, { today, locale }));
      navigatedRef.current = false;
      setResult(r);
      setCrit({
        regionIds: r.regions.map((o) => o.id),
        typeId: r.types[0]?.id ?? null,
        featureIds: r.features.map((o) => o.id),
        guests: r.guests,
        start: r.start,
        end: r.end,
      });
      setPending(r.choices);
      setChoiceTotal(r.choices.length);
      setUsedSuggestions([]);
      setDateSkipped(false);
      setArmed(true);
      setStatus("result");
    } catch {
      setStatus("error");
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void run(query);
  };

  const label = (kind: "region" | "type" | "feature", id: string): string => {
    const o = vocab?.options[`${kind}:${id}`];
    return o ? localizedName(o, locale) : id;
  };

  /* ---------------- Türetilmiş durum ---------------- */
  const datesValid =
    (crit.start === null && crit.end === null) ||
    (crit.start !== null && crit.end !== null && crit.start < crit.end && crit.start >= today);
  const hasCriteria =
    crit.regionIds.length > 0 ||
    crit.typeId !== null ||
    crit.featureIds.length > 0 ||
    crit.guests !== null ||
    crit.start !== null;

  const usedPhrases = (result?.suggestions ?? [])
    .filter((s) => usedSuggestions.includes(`${s.option.kind}:${s.option.id}`))
    .map((s) => s.phrase);
  const openSuggestions = (result?.suggestions ?? []).filter(
    (s) => !usedSuggestions.includes(`${s.option.kind}:${s.option.id}`) && !usedPhrases.includes(s.phrase)
  );
  const unknownShown = (result?.unknown ?? []).filter((u) => !usedPhrases.includes(u));
  const unsupported = result?.unsupported ?? [];
  const notesCount = unsupported.length + unknownShown.length + openSuggestions.length;

  const dateOpen = !!result?.dateIssue && crit.start === null && !dateSkipped;
  const currentChoice = pending[0] ?? null;

  const isNothing =
    status === "result" && !!result && !hasCriteria && pending.length === 0 && !dateOpen;
  const clean =
    status === "result" &&
    !!vocab &&
    pending.length === 0 &&
    !dateOpen &&
    notesCount === 0 &&
    hasCriteria &&
    datesValid;
  const redirecting = clean && armed && editor === null;

  const go = (c: Criteria = crit) => {
    if (!vocab || navigatedRef.current) return;
    try {
      const href = buildAiSearchHref(c, vocab, locale);
      navigatedRef.current = true;
      router.push(href);
    } catch {
      setHint(dict.datesIncomplete);
    }
  };
  const goRef = useRef(go);
  useEffect(() => {
    goRef.current = go;
  });

  /* Temiz sonuç → kısa bir an özeti göster, sonra mevcut sonuç sayfasına geç. */
  useEffect(() => {
    if (!redirecting) return;
    const t = window.setTimeout(
      () => goRef.current(),
      reducedMotion ? AUTO_DELAY_REDUCED_MS : AUTO_DELAY_MS
    );
    return () => window.clearTimeout(t);
  }, [redirecting, reducedMotion, crit]);

  /* ---------------- Eylemler ---------------- */
  const resolveChoice = (choice: ParseChoice, optIndex: number | null) => {
    if (optIndex !== null) {
      const opt = choice.options[optIndex];
      setCrit((c) => {
        if (opt.kind === "guests") return { ...c, guests: opt.value };
        if (opt.kind === "region")
          return c.regionIds.includes(opt.id) ? c : { ...c, regionIds: [...c.regionIds, opt.id] };
        if (opt.kind === "type") return { ...c, typeId: opt.id };
        return c.featureIds.includes(opt.id) ? c : { ...c, featureIds: [...c.featureIds, opt.id] };
      });
    }
    setPending((p) => p.filter((x) => x.key !== choice.key));
  };

  const openEditor = (next: NonNullable<EditorState>) => {
    if (editor && editor.kind === next.kind && editor.featureId === next.featureId) {
      setEditor(null);
      return;
    }
    if (!next.fromQuestion) setArmed(false);
    if (next.kind === "guests") setGuestDraft(crit.guests ?? 2);
    if (next.kind === "date") setDateDraft({ start: crit.start ?? "", end: crit.end ?? "" });
    setEditor(next);
  };
  const closeEditor = () => setEditor(null);

  const addSuggestion = (s: ParseResult["suggestions"][number]) => {
    const o = s.option;
    setCrit((c) =>
      o.kind === "region"
        ? { ...c, regionIds: c.regionIds.includes(o.id) ? c.regionIds : [...c.regionIds, o.id] }
        : o.kind === "type"
          ? { ...c, typeId: o.id }
          : { ...c, featureIds: c.featureIds.includes(o.id) ? c.featureIds : [...c.featureIds, o.id] }
    );
    setUsedSuggestions((u) => [...u, `${o.kind}:${o.id}`]);
  };

  /* ---------------- Metinler ---------------- */
  const choiceText = (c: ParseChoice): string => {
    const t =
      c.reason === "multiple_types"
        ? dict.choiceMultipleTypes
        : c.reason === "ambiguous_region"
          ? dict.choiceAmbiguousRegion
          : c.reason === "conflicting_guests"
            ? dict.choiceConflictingGuests
            : dict.choiceAmbiguousMatch;
    return formatDictionaryString(t, { phrase: c.phrase });
  };
  const choiceOptionLabel = (o: ParseChoice["options"][number]) =>
    o.kind === "guests" ? formatDictionaryString(dict.guestsOption, { n: o.value }) : o.label;

  const unsupportedText = (code: ParseResult["unsupported"][number]["code"]) =>
    ({
      bedrooms: dict.unsupportedBedrooms,
      budget: dict.unsupportedBudget,
      sea_distance: dict.unsupportedSeaDistance,
      pool: dict.unsupportedPool,
      min_stay: dict.unsupportedMinStay,
      not_in_system: dict.unsupportedNotInSystem,
    })[code];

  const dateIssueText = (issue: NonNullable<ParseResult["dateIssue"]>) =>
    formatDictionaryString(
      {
        month_only: dict.dateIssueMonthOnly,
        partial: dict.dateIssuePartial,
        relative: dict.dateIssueRelative,
        nights_only: dict.dateIssueNightsOnly,
        invalid_calendar: dict.dateIssueInvalidCalendar,
        end_before_start: dict.dateIssueEndBeforeStart,
        past: dict.dateIssuePast,
        too_long: dict.dateIssueTooLong,
        ambiguous_format: dict.dateIssueAmbiguousFormat,
        multiple: dict.dateIssueMultiple,
      }[issue.code],
      { phrase: issue.phrase }
    );

  const dayFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }),
    [locale]
  );
  const fmtDay = (ymd: string) => dayFmt.format(new Date(`${ymd}T00:00:00Z`));
  const dateChipText =
    crit.start && crit.end ? `${fmtDay(crit.start)} – ${fmtDay(crit.end)}` : null;

  const examples = [dict.example1, dict.example2, dict.example3];
  const regionRoots = (vocab?.regionOptions ?? [])
    .filter((o) => {
      const g = (o.filter_group_name ?? "").trim();
      return g.length > 0 && o.name === g;
    })
    .sort((a, b) => a.name.localeCompare(b.name, locale));
  const sortedByLabel = (kind: "type" | "feature", list: { id: string }[]) =>
    [...list].sort((a, b) => label(kind, a.id).localeCompare(label(kind, b.id), locale));

  const removeLabel = (text: string) => formatDictionaryString(dict.remove, { label: text });
  const editLabel = (text: string) => formatDictionaryString(dict.editChip, { label: text });

  /* ---------------- Düzenleyici içerikleri ---------------- */
  const removablePill = (text: string, onRemove: () => void) => (
    <span
      key={text}
      className="inline-flex items-center gap-1 rounded-full bg-[#0973BA]/10 py-1 pl-3 pr-1 text-[13px] font-medium text-[var(--color-stone-900)]"
    >
      {text}
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel(text)}
        className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-stone-500)] hover:bg-white hover:text-[var(--color-stone-900)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0973BA]/40"
      >
        <X size={13} aria-hidden />
      </button>
    </span>
  );
  const noteText = (t: string) => <p className="mt-2 text-[12px] text-[var(--color-stone-500)]">{t}</p>;
  const applyRow = (onApply: () => void, disabled = false, extra?: ReactNode) => (
    <div className="mt-4 flex items-center justify-between gap-2">
      <div>{extra}</div>
      <button
        type="button"
        data-ai-primary=""
        onClick={onApply}
        disabled={disabled}
        className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--color-stone-900)] px-4 py-2 text-[13.5px] font-medium text-white hover:bg-black focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0973BA]/50 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Check size={15} aria-hidden />
        {dict.apply}
      </button>
    </div>
  );

  const editorTitle = (e: NonNullable<EditorState>): string =>
    ({
      region: dict.regionsLabel,
      guests: dict.guestsLabel,
      date: dict.dateLabel,
      type: dict.typeLabel,
      feature: dict.featuresLabel,
      add: dict.addCriterion,
    })[e.kind];

  const renderEditorBody = (e: NonNullable<EditorState>): ReactNode => {
    if (!vocab) return null;
    switch (e.kind) {
      case "region":
        return (
          <>
            <div className="flex flex-wrap gap-1.5">
              {crit.regionIds.map((id) =>
                removablePill(label("region", id), () =>
                  setCrit((c) => ({ ...c, regionIds: c.regionIds.filter((x) => x !== id) }))
                )
              )}
            </div>
            <select
              aria-label={dict.addRegion}
              value=""
              onChange={(ev) => {
                const id = ev.target.value;
                if (id) setCrit((c) => (c.regionIds.includes(id) ? c : { ...c, regionIds: [...c.regionIds, id] }));
              }}
              className={`${fieldBase} mt-2 w-full`}
            >
              <option value="">{dict.addRegion}</option>
              {regionRoots
                .filter((o) => !crit.regionIds.includes(o.id))
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
            </select>
            {crit.regionIds.length > 1 && noteText(dict.regionsHint)}
          </>
        );
      case "guests":
        return (
          <>
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label={dict.guestsDecrease}
                onClick={() => setGuestDraft((g) => Math.max(1, g - 1))}
                disabled={guestDraft <= 1}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-stone-200)] text-[var(--color-stone-900)] hover:bg-[var(--color-stone-100,#f1f0ee)] disabled:opacity-40"
              >
                <Minus size={16} aria-hidden />
              </button>
              <output aria-live="polite" className="min-w-[88px] text-center text-[15px] font-semibold text-[var(--color-stone-900)]">
                {formatDictionaryString(dict.guestsOption, { n: guestDraft })}
              </output>
              <button
                type="button"
                aria-label={dict.guestsIncrease}
                onClick={() => setGuestDraft((g) => Math.min(50, g + 1))}
                disabled={guestDraft >= 50}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-stone-200)] text-[var(--color-stone-900)] hover:bg-[var(--color-stone-100,#f1f0ee)] disabled:opacity-40"
              >
                <Plus size={16} aria-hidden />
              </button>
            </div>
            {result?.guestBreakdown && crit.guests === result.guests && noteText(dict.guestsBreakdown)}
            {applyRow(
              () => {
                setCrit((c) => ({ ...c, guests: guestDraft }));
                closeEditor();
              },
              false,
              crit.guests !== null ? (
                <button
                  type="button"
                  onClick={() => {
                    setCrit((c) => ({ ...c, guests: null }));
                    closeEditor();
                  }}
                  className="text-[13px] text-[#0973BA] hover:underline"
                >
                  {removeLabel(dict.guestsLabel)}
                </button>
              ) : undefined
            )}
          </>
        );
      case "date": {
        const ds = dateDraft.start;
        const de = dateDraft.end;
        const draftOk = (ds === "" && de === "") || (ds !== "" && de !== "" && ds < de && ds >= today);
        return (
          <>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-[12px] font-medium text-[var(--color-stone-600)]">
                {dict.startLabel}
                <input
                  type="date"
                  min={today}
                  value={ds}
                  onChange={(ev) => setDateDraft((d) => ({ ...d, start: ev.target.value }))}
                  className={fieldBase}
                />
              </label>
              <label className="flex flex-col gap-1 text-[12px] font-medium text-[var(--color-stone-600)]">
                {dict.endLabel}
                <input
                  type="date"
                  min={ds || today}
                  value={de}
                  onChange={(ev) => setDateDraft((d) => ({ ...d, end: ev.target.value }))}
                  className={fieldBase}
                />
              </label>
            </div>
            {!draftOk && noteText(dict.datesIncomplete)}
            {applyRow(
              () => {
                setCrit((c) => ({ ...c, start: ds || null, end: de || null }));
                closeEditor();
              },
              !draftOk || (e.fromQuestion === true && ds === ""),
              crit.start !== null ? (
                <button
                  type="button"
                  onClick={() => {
                    setCrit((c) => ({ ...c, start: null, end: null }));
                    setDateSkipped(true);
                    closeEditor();
                  }}
                  className="text-[13px] text-[#0973BA] hover:underline"
                >
                  {dict.clearDates}
                </button>
              ) : undefined
            )}
          </>
        );
      }
      case "type":
        return (
          <>
            <select
              aria-label={dict.chooseType}
              value={crit.typeId ?? ""}
              onChange={(ev) => {
                const v = ev.target.value || null;
                setCrit((c) => ({ ...c, typeId: v }));
                closeEditor();
              }}
              className={`${fieldBase} w-full`}
            >
              <option value="">{dict.noType}</option>
              {sortedByLabel("type", vocab.typeOptions).map((o) => (
                <option key={o.id} value={o.id}>
                  {label("type", o.id)}
                </option>
              ))}
            </select>
          </>
        );
      case "feature":
        return (
          <>
            <div className="flex flex-wrap gap-1.5">
              {crit.featureIds.map((id) =>
                removablePill(label("feature", id), () =>
                  setCrit((c) => ({ ...c, featureIds: c.featureIds.filter((x) => x !== id) }))
                )
              )}
            </div>
            <select
              aria-label={dict.addFeature}
              value=""
              onChange={(ev) => {
                const id = ev.target.value;
                if (id) setCrit((c) => (c.featureIds.includes(id) ? c : { ...c, featureIds: [...c.featureIds, id] }));
              }}
              className={`${fieldBase} mt-2 w-full`}
            >
              <option value="">{dict.addFeature}</option>
              {sortedByLabel("feature", vocab.featureOptions)
                .filter((o) => !crit.featureIds.includes(o.id))
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {label("feature", o.id)}
                  </option>
                ))}
            </select>
            {crit.featureIds.length > 1 && noteText(dict.featuresHint)}
          </>
        );
      case "add": {
        const items: { kind: EditorKind; text: string; icon: ReactNode }[] = [
          { kind: "region", text: dict.regionsLabel, icon: <MapPin size={15} /> },
          { kind: "guests", text: dict.guestsLabel, icon: <Users size={15} /> },
          { kind: "date", text: dict.dateLabel, icon: <CalendarDays size={15} /> },
          { kind: "type", text: dict.typeLabel, icon: <House size={15} /> },
          { kind: "feature", text: dict.featuresLabel, icon: <Sparkles size={15} /> },
        ];
        return (
          <div className="grid grid-cols-2 gap-2">
            {items.map((it) => (
              <button
                key={it.kind}
                type="button"
                data-ai-keep=""
                onClick={() => openEditor({ kind: it.kind })}
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-stone-200)] px-3 py-2.5 text-left text-[13.5px] font-medium text-[var(--color-stone-900)] hover:border-[#0973BA]/50 hover:bg-[#0973BA]/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0973BA]/40"
              >
                <span aria-hidden className="text-[#ED7926]">
                  {it.icon}
                </span>
                {it.text}
              </button>
            ))}
          </div>
        );
      }
    }
  };

  const editorNode =
    editor && vocab ? (
      <EditorShell mobile={isMobile} title={editorTitle(editor)} closeLabel={dict.close} onClose={closeEditor}>
        {renderEditorBody(editor)}
      </EditorShell>
    ) : null;

  /* ---------------- Özet çipleri ---------------- */
  const isOpen = (kind: EditorKind, featureId?: string) =>
    !!editor && editor.kind === kind && editor.featureId === featureId;
  const chips: ReactNode[] = [];
  if (crit.regionIds.length > 0) {
    const t = crit.regionIds.map((id) => label("region", id)).join(" / ");
    chips.push(
      <SummaryChip key="region" icon={<MapPin size={14} />} text={t} ariaLabel={editLabel(t)}
        active={isOpen("region")} onClick={() => openEditor({ kind: "region" })} />
    );
  }
  if (crit.guests !== null) {
    const t = formatDictionaryString(dict.guestsOption, { n: crit.guests });
    chips.push(
      <SummaryChip key="guests" icon={<Users size={14} />} text={t} ariaLabel={editLabel(t)}
        active={isOpen("guests")} onClick={() => openEditor({ kind: "guests" })} />
    );
  }
  if (dateChipText) {
    chips.push(
      <SummaryChip key="date" icon={<CalendarDays size={14} />} text={dateChipText} ariaLabel={editLabel(dateChipText)}
        active={isOpen("date")} onClick={() => openEditor({ kind: "date" })} />
    );
  }
  if (crit.typeId) {
    const t = label("type", crit.typeId);
    chips.push(
      <SummaryChip key="type" icon={<House size={14} />} text={t} ariaLabel={editLabel(t)}
        active={isOpen("type")} onClick={() => openEditor({ kind: "type" })} />
    );
  }
  for (const id of crit.featureIds) {
    const t = label("feature", id);
    chips.push(
      <SummaryChip key={`f:${id}`} icon={<Check size={14} />} text={t} ariaLabel={editLabel(t)}
        active={isOpen("feature", id)} onClick={() => openEditor({ kind: "feature", featureId: id })} />
    );
  }

  /* ---------------- Akış satırı ---------------- */
  let flow: ReactNode = null;
  if (status === "result" && result && !isNothing) {
    if (redirecting) {
      flow = (
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 text-[13.5px] font-medium text-white">
            <span aria-hidden className="relative inline-flex h-2.5 w-2.5">
              <span className="absolute inset-0 animate-ping rounded-full bg-[#F7B267]/70 motion-reduce:animate-none" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#F7B267]" />
            </span>
            {dict.redirecting}
          </span>
          <button type="button" onClick={() => setArmed(false)} className={ghostBtn}>
            <Pencil size={13} aria-hidden />
            {dict.editCriteria}
          </button>
        </div>
      );
    } else if (currentChoice) {
      const idx = choiceTotal - pending.length + 1;
      flow = (
        <div>
          <p className="text-[13.5px] text-white">
            {choiceTotal > 1 && (
              <span className="mr-2 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[#F7B267]">
                {formatDictionaryString(dict.questionProgress, { n: idx, total: choiceTotal })}
              </span>
            )}
            {choiceText(currentChoice)}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={choiceText(currentChoice)}>
            {currentChoice.options.map((o, i) => (
              <button
                key={`${o.kind}:${o.id}`}
                type="button"
                onClick={() => resolveChoice(currentChoice, i)}
                className={optionBtn}
              >
                {choiceOptionLabel(o)}
              </button>
            ))}
            <button
              type="button"
              onClick={() => resolveChoice(currentChoice, null)}
              className="rounded-full px-3 py-1.5 text-[13px] text-white/80 hover:text-white hover:underline"
            >
              {dict.choiceSkip}
            </button>
          </div>
        </div>
      );
    } else if (dateOpen && result.dateIssue) {
      flow = (
        <div>
          <p className="flex items-start gap-2 text-[13.5px] text-white">
            <CalendarDays size={15} aria-hidden className="mt-0.5 shrink-0 text-[#F7B267]" />
            {dateIssueText(result.dateIssue)}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button
              type="button"
              data-ai-keep=""
              onClick={() => openEditor({ kind: "date", fromQuestion: true })}
              className={optionBtn}
            >
              {dict.pickDates}
            </button>
            <button
              type="button"
              onClick={() => {
                setDateSkipped(true);
                if (notesCount === 0 && hasCriteria) go({ ...crit, start: null, end: null });
              }}
              className={ghostBtn}
            >
              {dict.searchWithoutDates}
            </button>
          </div>
        </div>
      );
    } else if (hasCriteria) {
      flow = (
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          {notesCount > 0 ? (
            <p className="text-[12.5px] text-white/80">{dict.notesHint}</p>
          ) : (
            <span />
          )}
          <button type="button" onClick={() => go()} disabled={!datesValid} className={primaryBtn}>
            {dict.showVillas}
            <ArrowRight size={15} aria-hidden />
          </button>
        </div>
      );
    }
  }

  const notesNode =
    status === "result" && result && notesCount > 0 ? (
      <div className="space-y-1.5 text-[12.5px] leading-[1.5] text-white/90">
        {unsupported.length > 0 && (
          <p className="flex items-start gap-1.5">
            <CircleAlert size={14} aria-hidden className="mt-[3px] shrink-0 text-[#F7B267]" />
            <span>
              <span className="font-semibold text-white">{dict.notFilteredLabel}:</span>{" "}
              {unsupported.map((u, i) => (
                <span key={`${u.code}:${u.phrase}`}>
                  {i > 0 && " · "}
                  <span className="font-medium text-white">{u.phrase}</span>{" "}
                  <span className="text-white/70">({unsupportedText(u.code)})</span>
                </span>
              ))}
            </span>
          </p>
        )}
        {unknownShown.length > 0 && (
          <p className="flex items-start gap-1.5">
            <CircleAlert size={14} aria-hidden className="mt-[3px] shrink-0 text-[#F7B267]" />
            <span>
              <span className="font-semibold text-white">{dict.notUnderstoodLabel}:</span> {unknownShown.join(", ")}
            </span>
          </p>
        )}
        {openSuggestions.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pl-5">
            <span className="text-white/80">{dict.suggestionLabel}</span>
            {openSuggestions.map((s) => (
              <button
                key={`${s.option.kind}:${s.option.id}`}
                type="button"
                onClick={() => addSuggestion(s)}
                className="rounded-full border border-white/40 bg-white/15 px-3 py-1 text-[12.5px] font-medium text-white hover:bg-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              >
                {formatDictionaryString(dict.suggestionAdd, { label: s.option.label })}
              </button>
            ))}
          </div>
        )}
      </div>
    ) : null;

  const showExamples = status !== "result" || isNothing;

  return (
    <div className="text-left">
      {/* ---------------- Giriş ---------------- */}
      <form
        onSubmit={onSubmit}
        className="relative flex flex-col gap-2 rounded-[16px] border border-white/30 bg-gradient-to-b from-white/30 to-white/[0.14] p-2 shadow-[0_20px_50px_-24px_rgba(9,115,186,0.35),0_14px_38px_-26px_rgba(237,121,38,0.3)] backdrop-blur-xl md:flex-row md:items-stretch md:p-2.5"
      >
        <label className="flex min-w-0 flex-1 items-start gap-3 rounded-xl border border-white/50 bg-white/85 px-4 py-3">
          <Sparkles size={18} aria-hidden className="mt-0.5 shrink-0 text-[#ED7926]" />
          <span className="sr-only">{dict.inputLabel}</span>
          <textarea
            ref={inputRef}
            value={query}
            rows={1}
            maxLength={300}
            onChange={(e) => {
              setQuery(e.target.value);
              if (armed) setArmed(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void run(query);
              }
            }}
            placeholder={dict.placeholder}
            aria-describedby="hero-ai-examples"
            className="min-h-[24px] w-full resize-none bg-transparent text-[15px] text-[var(--color-stone-900)] placeholder:text-[var(--color-stone-500)] focus:outline-none [field-sizing:content] max-h-[96px]"
          />
        </label>
        <button
          type="submit"
          disabled={status === "loading"}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#ED7926] to-[#0973BA] px-7 py-3.5 text-[14px] font-medium tracking-[0.02em] text-white shadow-[0_20px_44px_-12px_rgba(237,121,38,0.5)] transition-[transform,box-shadow] duration-300 hover:-translate-y-[1px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0973BA]/50 disabled:opacity-70 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
        >
          {status === "loading" ? dict.parsing : dict.submit}
          <ArrowRight size={16} aria-hidden />
        </button>
      </form>

      {hint && (
        <p role="alert" className="mt-2 rounded-lg bg-white/90 px-3 py-2 text-[13px] text-[#9a3412]">
          {hint}
        </p>
      )}

      {status === "error" && (
        <div role="alert" className="mt-3 rounded-2xl bg-white/95 px-4 py-3 text-[13.5px] text-[var(--color-stone-800)]">
          {dict.loadError}
          {onSwitchToDate && (
            <button type="button" onClick={onSwitchToDate} className="ml-2 font-semibold text-[#0973BA] underline underline-offset-2">
              {dict.switchToDate}
            </button>
          )}
        </div>
      )}

      {/* ---------------- Kompakt özet (koyu cam) ---------------- */}
      {status === "result" && result && vocab && !isNothing && (
        <section
          aria-label={dict.understoodLabel}
          className="relative mt-3 rounded-2xl border border-white/20 bg-[#0b1b3a]/60 px-3 py-2.5 text-white shadow-[0_22px_48px_-24px_rgba(11,31,58,0.7)] backdrop-blur-xl md:px-3.5"
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-0.5 inline-flex items-center gap-1 text-[12.5px] font-semibold tracking-[0.02em] text-[#F7B267]">
              <Sparkles size={14} aria-hidden />
              {dict.understoodLabel}:
            </span>
            {chips}
            <button
              type="button"
              data-ai-keep=""
              aria-label={dict.addCriterion}
              aria-haspopup="dialog"
              aria-expanded={isOpen("add")}
              onClick={() => openEditor({ kind: "add" })}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-dashed border-white/40 text-white/90 transition-colors hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
            >
              <Plus size={15} aria-hidden />
            </button>
          </div>

          {!isMobile && editorNode}

          <div role="status" aria-live="polite" className="empty:hidden">
            {(flow || notesNode) && (
              <div className="mt-2.5 space-y-2.5 border-t border-white/15 pt-2.5">
                {notesNode}
                {flow}
              </div>
            )}
          </div>
        </section>
      )}
      {isMobile && editorNode}

      {/* ---------------- Hiçbir şey anlaşılmadı ---------------- */}
      {isNothing && result && (
        <div
          role="status"
          aria-live="polite"
          className="mt-3 rounded-2xl border border-white/20 bg-[#0b1b3a]/60 px-3.5 py-3 text-[13.5px] text-white backdrop-blur-xl"
        >
          <p>
            {dict.nothingParsed}
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
          {notesNode && <div className="mt-2">{notesNode}</div>}
        </div>
      )}

      {/* ---------------- Örnekler ---------------- */}
      {showExamples && (
        <div id="hero-ai-examples" className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-medium text-white/90 [text-shadow:0_1px_10px_rgb(0_15_45/50%)]">
            {dict.examplesLabel}
          </span>
          {examples.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => {
                setQuery(ex);
                void run(ex);
              }}
              className="max-w-full rounded-full border border-white/40 bg-white/15 px-3.5 py-1.5 text-left text-[13px] text-white backdrop-blur-md transition-colors hover:bg-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      <p className="mt-3 text-[13px] text-white/90 [text-shadow:0_1px_10px_rgb(0_15_45/50%)]">
        {dict.offerPrompt}{" "}
        <Link href={localeHref("/teklif-al", locale)} className="font-semibold underline underline-offset-[3px]">
          {dict.offerLink} →
        </Link>
        <span className="mt-1 block text-[11.5px] text-white/70">{dict.privacyNote}</span>
      </p>
    </div>
  );
}
