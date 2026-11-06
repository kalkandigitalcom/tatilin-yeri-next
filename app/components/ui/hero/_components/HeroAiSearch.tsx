"use client";

import { useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Pencil, Sparkles, X } from "lucide-react";

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
   ===============================================================
   Akış:
     1) Kullanıcı serbest metin yazar (TR/EN/DE).
     2) Sözlük, MEVCUT `GET /api/public/taxonomies` cevabından kurulur
        (gerçek bölge / villa tipi / özellik kayıtları; zod ile doğrulanır).
     3) `parseNaturalQuery` metni TARAYICIDA ayrıştırır: harici model,
        API anahtarı, sunucu çağrısı YOK; metin hiçbir yere gönderilmez
        ve kaydedilmez.
     4) "Bulunan kriterler" kartı: kullanıcı kontrol eder / düzenler;
        belirsizlikler (çoklu villa tipi, çakışan eşleşme) seçim ister;
        desteklenmeyen ve anlaşılmayan ifadeler açıkça listelenir.
     5) "Bu kriterlerle ara" → `buildHeroSearchParams` (mevcut) →
        `localeHref('/arama?...')` → mevcut `/arama` sayfası.
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

const inputBase =
  "rounded-lg border border-[var(--color-stone-200)] bg-white px-2.5 py-1.5 text-[13.5px] text-[var(--color-stone-900)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0973BA]/40";

function Chip({ text, removeLabel, onRemove }: { text: string; removeLabel: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#0973BA]/10 py-1 pl-3 pr-1 text-[13px] font-medium text-[var(--color-stone-900)]">
      {text}
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[var(--color-stone-500)] hover:bg-white hover:text-[var(--color-stone-900)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0973BA]/40"
      >
        <X size={13} aria-hidden />
      </button>
    </span>
  );
}

function Row({ title, children, note }: { title: string; children: ReactNode; note?: string }) {
  return (
    <div className="grid gap-1.5 border-t border-[var(--color-stone-100)] py-2.5 first:border-t-0 md:grid-cols-[120px_1fr] md:items-start md:gap-3">
      <div className="pt-1 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[var(--color-stone-500)]">
        {title}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">{children}</div>
        {note && <p className="mt-1 text-[12px] text-[var(--color-stone-500)]">{note}</p>}
      </div>
    </div>
  );
}

export default function HeroAiSearch({ locale = DEFAULT_LOCALE, onSwitchToDate }: HeroAiSearchProps) {
  const dict = getDictionary(locale).home.aiSearch;
  const router = useRouter();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "review" | "error">("idle");
  const [hint, setHint] = useState<string | null>(null);
  const [vocab, setVocab] = useState<Vocabulary | null>(null);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [crit, setCrit] = useState<Criteria>(EMPTY);
  const [pending, setPending] = useState<ParseChoice[]>([]);
  const [usedSuggestions, setUsedSuggestions] = useState<string[]>([]);

  const today = useMemo(() => todayIstanbulYmd(), []);

  const run = async (text: string) => {
    const q = text.trim();
    if (q.length < 2) {
      setHint(dict.emptyQuery);
      return;
    }
    setHint(null);
    setStatus("loading");
    try {
      const v = vocab ?? (await loadAiVocabulary());
      setVocab(v);
      const r = ParseResultSchema.parse(parseNaturalQuery(q, v, { today, locale }));
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
      setUsedSuggestions([]);
      setStatus("review");
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

  const datesValid =
    (crit.start === null && crit.end === null) ||
    (crit.start !== null && crit.end !== null && crit.start < crit.end && crit.start >= today);
  const hasCriteria =
    crit.regionIds.length > 0 ||
    crit.typeId !== null ||
    crit.featureIds.length > 0 ||
    crit.guests !== null ||
    crit.start !== null;
  const canConfirm = status === "review" && pending.length === 0 && datesValid && hasCriteria;

  const confirm = () => {
    if (!vocab || !canConfirm) return;
    try {
      router.push(buildAiSearchHref(crit, vocab, locale));
    } catch {
      setHint(dict.datesIncomplete);
    }
  };

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

  const examples = [dict.example1, dict.example2, dict.example3];
  const regionRoots = (vocab?.regionOptions ?? [])
    .filter((o) => {
      const g = (o.filter_group_name ?? "").trim();
      return g.length > 0 && o.name === g;
    })
    .sort((a, b) => a.name.localeCompare(b.name, locale));
  const sortedByLabel = (kind: "type" | "feature", list: { id: string }[]) =>
    [...list].sort((a, b) => label(kind, a.id).localeCompare(label(kind, b.id), locale));

  const notFoundCount =
    (result?.unsupported.length ?? 0) + (result?.unknown.length ?? 0) + (result?.dateIssue ? 1 : 0);

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
            onChange={(e) => setQuery(e.target.value)}
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

      {/* ---------------- Örnekler ---------------- */}
      {status !== "review" && (
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

      {/* ---------------- Onay kartı ---------------- */}
      {status === "review" && result && vocab && (
        <section
          aria-live="polite"
          className="mt-3 rounded-2xl border border-[var(--color-stone-100)] bg-white/95 px-4 py-3.5 shadow-[0_20px_44px_-20px_rgba(11,31,58,0.35)] backdrop-blur-md md:px-5"
        >
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-[15px] font-semibold text-[var(--color-stone-900)]">{dict.reviewTitle}</h3>
            <button
              type="button"
              onClick={() => {
                setStatus("idle");
                inputRef.current?.focus();
              }}
              className="inline-flex items-center gap-1 text-[12.5px] font-medium text-[#0973BA] hover:underline"
            >
              <Pencil size={13} aria-hidden />
              {dict.editQuery}
            </button>
          </div>
          <p className="mt-0.5 text-[12.5px] text-[var(--color-stone-500)]">{dict.reviewHint}</p>

          {/* Seçim gerektiren belirsizlikler — OTOMATİK SEÇİLMEZ */}
          {pending.length > 0 && (
            <div className="mt-3 rounded-xl border border-[#ED7926]/40 bg-[#fff5ef] px-3 py-2.5">
              <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#c84a20]">{dict.choicesTitle}</div>
              {pending.map((c) => (
                <div key={c.key} className="mt-2">
                  <p className="text-[13.5px] text-[var(--color-stone-800)]">{choiceText(c)}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label={choiceText(c)}>
                    {c.options.map((o, i) => (
                      <button
                        key={`${o.kind}:${o.id}`}
                        type="button"
                        onClick={() => resolveChoice(c, i)}
                        className="rounded-full border border-[#0973BA]/40 bg-white px-3 py-1 text-[13px] font-medium text-[#0973BA] hover:bg-[#0973BA]/10"
                      >
                        {choiceOptionLabel(o)}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => resolveChoice(c, null)}
                      className="rounded-full px-3 py-1 text-[13px] text-[var(--color-stone-500)] hover:underline"
                    >
                      {dict.choiceSkip}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Bulunan / düzenlenebilir kriterler */}
          <div className="mt-2">
            <Row title={dict.regionsLabel} note={crit.regionIds.length > 1 ? dict.regionsHint : undefined}>
              {crit.regionIds.map((id) => (
                <Chip
                  key={id}
                  text={label("region", id)}
                  removeLabel={formatDictionaryString(dict.remove, { label: label("region", id) })}
                  onRemove={() => setCrit((c) => ({ ...c, regionIds: c.regionIds.filter((x) => x !== id) }))}
                />
              ))}
              <select
                aria-label={dict.addRegion}
                value=""
                onChange={(e) => {
                  const id = e.target.value;
                  if (id) setCrit((c) => (c.regionIds.includes(id) ? c : { ...c, regionIds: [...c.regionIds, id] }));
                }}
                className={inputBase}
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
            </Row>

            <Row title={dict.guestsLabel} note={result.guestBreakdown && crit.guests === result.guests ? dict.guestsBreakdown : undefined}>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={50}
                aria-label={dict.guestsLabel}
                placeholder={dict.notSet}
                value={crit.guests ?? ""}
                onChange={(e) => {
                  const v = Math.trunc(Number(e.target.value));
                  setCrit((c) => ({ ...c, guests: e.target.value === "" || !(v >= 1 && v <= 50) ? null : v }));
                }}
                className={`${inputBase} w-24`}
              />
            </Row>

            <Row title={dict.dateLabel} note={!datesValid ? dict.datesIncomplete : undefined}>
              <label className="inline-flex items-center gap-1.5 text-[12.5px] text-[var(--color-stone-600)]">
                {dict.startLabel}
                <input
                  type="date"
                  min={today}
                  value={crit.start ?? ""}
                  onChange={(e) => setCrit((c) => ({ ...c, start: e.target.value || null }))}
                  className={inputBase}
                />
              </label>
              <label className="inline-flex items-center gap-1.5 text-[12.5px] text-[var(--color-stone-600)]">
                {dict.endLabel}
                <input
                  type="date"
                  min={crit.start ?? today}
                  value={crit.end ?? ""}
                  onChange={(e) => setCrit((c) => ({ ...c, end: e.target.value || null }))}
                  className={inputBase}
                />
              </label>
              {(crit.start || crit.end) && (
                <button
                  type="button"
                  onClick={() => setCrit((c) => ({ ...c, start: null, end: null }))}
                  className="text-[12.5px] text-[#0973BA] hover:underline"
                >
                  {dict.clearDates}
                </button>
              )}
            </Row>

            <Row title={dict.typeLabel}>
              <select
                aria-label={dict.chooseType}
                value={crit.typeId ?? ""}
                onChange={(e) => setCrit((c) => ({ ...c, typeId: e.target.value || null }))}
                className={inputBase}
              >
                <option value="">{dict.noType}</option>
                {sortedByLabel("type", vocab.typeOptions).map((o) => (
                  <option key={o.id} value={o.id}>
                    {label("type", o.id)}
                  </option>
                ))}
              </select>
            </Row>

            <Row title={dict.featuresLabel} note={crit.featureIds.length > 1 ? dict.featuresHint : undefined}>
              {crit.featureIds.map((id) => (
                <Chip
                  key={id}
                  text={label("feature", id)}
                  removeLabel={formatDictionaryString(dict.remove, { label: label("feature", id) })}
                  onRemove={() => setCrit((c) => ({ ...c, featureIds: c.featureIds.filter((x) => x !== id) }))}
                />
              ))}
              <select
                aria-label={dict.addFeature}
                value=""
                onChange={(e) => {
                  const id = e.target.value;
                  if (id) setCrit((c) => (c.featureIds.includes(id) ? c : { ...c, featureIds: [...c.featureIds, id] }));
                }}
                className={inputBase}
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
            </Row>
          </div>

          {/* Yazım önerileri — yalnız kullanıcı tıklarsa eklenir */}
          {result.suggestions.filter((s) => !usedSuggestions.includes(`${s.option.kind}:${s.option.id}`)).length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[13px] text-[var(--color-stone-700)]">
              <span>{dict.suggestionLabel}</span>
              {result.suggestions
                .filter((s) => !usedSuggestions.includes(`${s.option.kind}:${s.option.id}`))
                .map((s) => (
                  <button
                    key={`${s.option.kind}:${s.option.id}`}
                    type="button"
                    onClick={() => {
                      const o = s.option;
                      setCrit((c) =>
                        o.kind === "region"
                          ? { ...c, regionIds: c.regionIds.includes(o.id) ? c.regionIds : [...c.regionIds, o.id] }
                          : o.kind === "type"
                            ? { ...c, typeId: o.id }
                            : { ...c, featureIds: c.featureIds.includes(o.id) ? c.featureIds : [...c.featureIds, o.id] }
                      );
                      setUsedSuggestions((u) => [...u, `${o.kind}:${o.id}`]);
                    }}
                    className="rounded-full border border-[#0973BA]/40 bg-white px-3 py-1 font-medium text-[#0973BA] hover:bg-[#0973BA]/10"
                  >
                    {formatDictionaryString(dict.suggestionAdd, { label: s.option.label })}
                  </button>
                ))}
            </div>
          )}

          {/* Bulunamayan kriterler — sessizce atılmaz */}
          {notFoundCount > 0 && (
            <div className="mt-3 rounded-xl bg-[var(--color-stone-50,#f7f6f4)] px-3 py-2.5">
              <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--color-stone-600)]">
                {dict.notFoundTitle}
              </div>
              <ul className="mt-1.5 space-y-1 text-[13px] text-[var(--color-stone-700)]">
                {result.dateIssue && <li>{dateIssueText(result.dateIssue)}</li>}
                {result.unsupported.map((u) => (
                  <li key={`${u.code}:${u.phrase}`}>
                    <span className="font-medium text-[var(--color-stone-900)]">{u.phrase}</span>
                    {" — "}
                    {unsupportedText(u.code)}
                  </li>
                ))}
                {result.unknown.length > 0 && (
                  <li>
                    <span className="font-medium text-[var(--color-stone-900)]">{dict.unknownLabel}:</span>{" "}
                    {result.unknown.join(", ")}. {dict.unknownHint}
                  </li>
                )}
              </ul>
            </div>
          )}

          {!hasCriteria && pending.length === 0 && (
            <p className="mt-3 text-[13.5px] text-[var(--color-stone-800)]">
              {dict.nothingParsed}
              {onSwitchToDate && (
                <button
                  type="button"
                  onClick={onSwitchToDate}
                  className="ml-2 font-semibold text-[#0973BA] underline underline-offset-2"
                >
                  {dict.switchToDate}
                </button>
              )}
            </p>
          )}

          {pending.length > 0 && (
            <p className="mt-3 text-[12.5px] text-[#c84a20]">{dict.resolveChoicesFirst}</p>
          )}

          <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <p className="text-[11.5px] text-[var(--color-stone-500)]">{dict.privacyNote}</p>
            <button
              type="button"
              onClick={confirm}
              disabled={!canConfirm}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#ED7926] to-[#0973BA] px-6 py-3 text-[14px] font-medium text-white shadow-[0_16px_36px_-14px_rgba(237,121,38,0.55)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0973BA]/50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {dict.confirm}
              <ArrowRight size={16} aria-hidden />
            </button>
          </div>
        </section>
      )}

      <p className="mt-3 text-[13px] text-white/90 [text-shadow:0_1px_10px_rgb(0_15_45/50%)]">
        {dict.offerPrompt}{" "}
        <Link href={localeHref("/teklif-al", locale)} className="font-semibold underline underline-offset-[3px]">
          {dict.offerLink} →
        </Link>
      </p>
    </div>
  );
}
