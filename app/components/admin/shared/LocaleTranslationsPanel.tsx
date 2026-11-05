"use client";

/* ===============================================================
   🌐 ORTAK ÇEVİRİ PANELİ — Faz 5 (simetrik çoklu dil)
   ===============================================================
   Tek alanlı içerik modüllerinin (özellik, kural, fiyata dahil, ödeme
   yöntemi, menü, villa tipi …) "Çeviriler" paneli. Eski modül panelleriyle
   AYNI kullanıcı deneyimi (referans metin + pill-tab + tek input +
   "<dil> sürümünü kaydet"), tek fark: diller SABİT EN/DE değil, ANA DİLE
   göre kurulur:
     ana dil TR → referans TR, sekmeler EN, DE
     ana dil EN → referans EN, sekmeler TR, DE
     ana dil DE → referans DE, sekmeler TR, EN
   Ana dil değeri ana formda (liste satırı) düzenlenir; burada salt
   okunur referanstır. Eksik çeviriler ayrıca listelenir.
   Yazma: modülün server action'ı → merkezi saveContent (Faz 4/5).
   =============================================================== */

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { useNotify } from "@/app/components/admin/notifications/NotificationProvider";
import {
  ADMIN_LOCALE_LABELS,
  type AdminLocaleLayout,
} from "@/lib/i18n/content/content-admin";
import type { Locale } from "@/lib/i18n/config";

export type LocaleTranslationsLoadResult =
  | {
      ok: true;
      rows: Array<{ locale: string } & Record<string, unknown>>;
      /** Faz 5: verilmezse (eski çağrılar) ana dil TR, sekmeler EN/DE. */
      layout?: AdminLocaleLayout;
    }
  | { ok: false; error: string };

export type LocaleTranslationsSaveResult =
  | { ok: true; row: Record<string, unknown> }
  | { ok: false; error: string };

type Props = {
  recordId: string;
  /** Ana dil değeri (referans, salt okunur). */
  referenceValue: string;
  field: string;
  /** Boş kayıtta gösterilen hata ("İsim gerekli" …) — eski davranış. */
  requiredMessage: string;
  /** true: boş değer GEÇERLİ → o dilin çevirisi BİLEREK boşaltılır ("")
   *  ve okuma tarafında ana dile düşer (ödeme yöntemi, menü — eski davranış). */
  allowEmpty?: boolean;
  toastPrefix: string;
  maxLength?: number;
  load: (id: string) => Promise<LocaleTranslationsLoadResult>;
  save: (locale: Locale, value: string) => Promise<LocaleTranslationsSaveResult>;
};

const DEFAULT_LAYOUT: AdminLocaleLayout = {
  root: "tr",
  translations: ["en", "de"],
  enabled: ["tr", "en", "de"],
  multilingual: true,
};

export default function LocaleTranslationsPanel({
  recordId,
  referenceValue,
  field,
  requiredMessage,
  allowEmpty = false,
  toastPrefix,
  maxLength = 200,
  load,
  save,
}: Props) {
  const toast = useNotify();
  const [layout, setLayout] = useState<AdminLocaleLayout>(DEFAULT_LAYOUT);
  const [forms, setForms] = useState<Partial<Record<Locale, string>>>({});
  const [activeLocale, setActiveLocale] = useState<Locale>(DEFAULT_LAYOUT.translations[0]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const result = await load(recordId);
      if (cancelled) return;
      if (!result.ok) {
        toast.error("Çeviriler yüklenemedi", {
          id: `${toastPrefix}-translations-load-${recordId}`,
          description: result.error,
        });
        setLoading(false);
        return;
      }
      const lay = result.layout ?? DEFAULT_LAYOUT;
      const next: Partial<Record<Locale, string>> = {};
      for (const l of lay.translations) next[l] = "";
      for (const row of result.rows) {
        const l = row.locale as Locale;
        if (!lay.translations.includes(l)) continue;
        const v = row[field];
        next[l] = typeof v === "string" ? v : "";
      }
      setLayout(lay);
      setForms(next);
      setActiveLocale((prev) => (lay.translations.includes(prev) ? prev : lay.translations[0]));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordId]);

  const missing = layout.translations.filter((l) => !(forms[l] ?? "").trim());

  async function handleSave() {
    const current = forms[activeLocale] ?? "";
    if (!allowEmpty && !current.trim()) {
      toast.error(requiredMessage, { id: `${toastPrefix}-translations-save-${recordId}` });
      return;
    }
    setSaving(true);
    try {
      const result = await save(activeLocale, current);
      if (!result.ok) {
        toast.error("Kaydedilemedi", {
          id: `${toastPrefix}-translations-save-${recordId}`,
          description: result.error,
        });
        return;
      }
      const saved = result.row?.[field];
      setForms((prev) => ({ ...prev, [activeLocale]: typeof saved === "string" ? saved : current }));
      toast.success(`${ADMIN_LOCALE_LABELS[activeLocale]} çevirisi kaydedildi`, {
        id: `${toastPrefix}-translations-save-${recordId}`,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card-premium p-4 mt-2 space-y-4">
      <div>
        <p className="text-[11px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-400)]">
          {ADMIN_LOCALE_LABELS[layout.root]} (referans, salt okunur)
        </p>
        <p className="text-sm text-[var(--color-stone-600)] mt-1">{referenceValue}</p>
      </div>

      <div className="flex gap-2">
        {layout.translations.map((locale) => (
          <button
            key={locale}
            type="button"
            onClick={() => setActiveLocale(locale)}
            title={missing.includes(locale) ? "Bu dilde çeviri eksik" : undefined}
            className={
              activeLocale === locale
                ? "rounded-full bg-[var(--color-stone-900)] px-3 py-1 text-xs font-semibold text-white"
                : "rounded-full bg-[var(--color-stone-100)] px-3 py-1 text-xs font-semibold text-[var(--color-stone-600)]"
            }
          >
            {ADMIN_LOCALE_LABELS[locale]}
            {!loading && missing.includes(locale) && (
              <span aria-hidden="true" className="ml-1 text-amber-500">●</span>
            )}
          </button>
        ))}
      </div>

      {!loading && missing.length > 0 && (
        <p className="text-[12px] text-amber-700" data-testid="missing-translations">
          Eksik çeviri: {missing.map((l) => ADMIN_LOCALE_LABELS[l]).join(", ")} — eksik dilde içerik
          ana dilden gösterilir ve sayfa arama motorlarına kapalı tutulur.
        </p>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-[var(--color-stone-500)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Yükleniyor…
        </div>
      ) : (
        <div className="space-y-3">
          <input
            aria-label={ADMIN_LOCALE_LABELS[activeLocale]}
            className="input"
            maxLength={maxLength}
            value={forms[activeLocale] ?? ""}
            onChange={(e) => setForms((prev) => ({ ...prev, [activeLocale]: e.target.value }))}
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--color-champagne-700)] hover:text-[var(--color-champagne-600)] px-3 py-2 rounded-lg hover:bg-[var(--color-sand-50)] transition disabled:opacity-60"
          >
            {saving ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Kaydediliyor…
              </span>
            ) : (
              `${ADMIN_LOCALE_LABELS[activeLocale]} sürümünü kaydet`
            )}
          </button>
        </div>
      )}
    </div>
  );
}
