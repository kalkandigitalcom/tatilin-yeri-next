"use client";

import { SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/config";
import { LOCALE_META } from "@/lib/i18n/locale-registry";
import { isLocaleToggleLocked } from "@/lib/i18n/site-locales.validation";

/* ===============================================================
   🌐 DİL BAZLI AÇMA/KAPAMA ALANI — Ayarlar > Genel > Çoklu Dil (Faz 1)
   ===============================================================
   Saf görünüm bileşeni: state ve kaydetme genel sayfadadır (tek
   "Kaydet"). Her dil için: ad, URL, aktif/pasif durumu ve anahtar.
   Ana dil ve Faz 1'de kapatılamayan diller kilitli gösterilir.
   =============================================================== */

export type LocaleEnabledMap = Record<Locale, boolean>;

function urlFor(locale: Locale, rootLocale: Locale): string {
  return locale === rootLocale ? "/" : `/${locale}`;
}

export default function LocaleAvailabilityField({
  rootLocale,
  value,
  onChange,
  multilingualEnabled,
  disabled,
  unavailableReason,
}: {
  rootLocale: Locale;
  value: LocaleEnabledMap;
  onChange: (next: LocaleEnabledMap) => void;
  multilingualEnabled: boolean;
  disabled?: boolean;
  /** Dil tablosu okunamadıysa (ör. migration 101 yok) gösterilecek not. */
  unavailableReason?: string | null;
}) {
  const locked = !!unavailableReason;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] tracking-[0.18em] uppercase font-medium text-[var(--color-stone-500)]">
          Diller
        </span>
        <span className="text-[11.5px] text-[var(--color-stone-400)]">
          Ana dil: {LOCALE_META[rootLocale].adminLabel} ({urlFor(rootLocale, rootLocale)})
        </span>
      </div>

      {unavailableReason && (
        <p
          role="status"
          className="text-[12.5px] rounded-lg px-3 py-2 bg-amber-50 text-amber-800 border border-amber-200"
        >
          {unavailableReason}
        </p>
      )}

      <ul className="divide-y divide-[var(--color-stone-100)] rounded-xl border border-[var(--color-stone-100)]">
        {SUPPORTED_LOCALES.map((l) => {
          const isRoot = l === rootLocale;
          const rowLocked = locked || isLocaleToggleLocked(l, rootLocale);
          const enabled = isRoot || value[l];
          const live = enabled && (multilingualEnabled || isRoot);
          const inputId = `locale-toggle-${l}`;
          const lockNote = isRoot
            ? "Ana dil kapatılamaz."
            : rowLocked && !locked
              ? "Bu sürümde kapatılamaz (öneksiz kök URL'lerde çalışıyor)."
              : null;

          return (
            <li key={l} className="flex items-center justify-between gap-4 px-3.5 py-3">
              <div className="min-w-0">
                <label
                  htmlFor={inputId}
                  className="text-[14px] font-medium text-[var(--color-stone-900)] flex items-center gap-2 flex-wrap"
                >
                  {LOCALE_META[l].adminLabel}
                  <code className="text-[11.5px] font-normal text-[var(--color-stone-500)] bg-[var(--color-stone-50)] rounded px-1.5 py-0.5">
                    {urlFor(l, rootLocale)}
                  </code>
                  {isRoot && (
                    <span className="text-[10.5px] tracking-[0.12em] uppercase font-medium text-[var(--color-champagne-700,#8a6d3b)]">
                      Ana dil
                    </span>
                  )}
                </label>
                <span
                  className={
                    "text-[12px] block mt-0.5 " +
                    (live ? "text-emerald-700" : "text-[var(--color-stone-500)]")
                  }
                >
                  {live
                    ? "Yayında"
                    : enabled
                      ? "Aktif — Çoklu Dil Sistemi kapalı olduğu için yayında değil"
                      : "Kapalı — sayfaları 404 döner, çevirileri korunur"}
                  {lockNote ? ` · ${lockNote}` : ""}
                </span>
              </div>
              <span className="shrink-0">
                <input
                  id={inputId}
                  type="checkbox"
                  role="switch"
                  aria-checked={enabled}
                  checked={enabled}
                  disabled={disabled || rowLocked}
                  onChange={(e) => onChange({ ...value, [l]: e.target.checked })}
                  className="sr-only peer"
                />
                <label
                  htmlFor={inputId}
                  aria-hidden="true"
                  className={
                    "relative inline-block w-10 h-6 rounded-full bg-[var(--color-stone-200)] peer-checked:bg-[var(--color-champagne-500)] transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--color-champagne-500)]/50 " +
                    (disabled || rowLocked ? "opacity-60 cursor-not-allowed" : "cursor-pointer")
                  }
                >
                  <span
                    className={
                      "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform " +
                      (enabled ? "translate-x-4" : "")
                    }
                  />
                </label>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
