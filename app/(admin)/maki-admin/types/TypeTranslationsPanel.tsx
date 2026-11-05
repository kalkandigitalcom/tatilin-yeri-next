"use client";

/* ===============================================================
   🌐 Faz 5 — Villa tipi (villa_types) çeviri paneli
   ===============================================================
   Simetrik çoklu dil:
     • referans = ANA DİL adı (liste satırında düzenlenir)
     • sekmeler = diğer iki dil (ad + o dilin URL slug'ı)
     • TEKNİK ANAHTAR (villa_types.slug) ayrı ve salt okunur
     • ana dilin URL slug'ı ayrı alan (TR'de, base modunda migration 108
       gerekir; yoksa kilitli ve açıklamalı)
   Ana dil TR iken görünüm eskisiyle aynı: TR referans + EN/DE sekmeleri.
   =============================================================== */

import LocalizedSlugField from "@/app/components/admin/shared/LocalizedSlugField";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useNotify } from "@/app/components/admin/notifications/NotificationProvider";
import {
  loadTypeTranslationsAction,
  saveTypeRootSlugAction,
  saveTypeTranslationAction,
} from "./type-translations.action";
import {
  revalidateTaxonomy,
  revalidateMenu,
} from "@/app/services/revalidate.actions";
import type { Locale } from "@/lib/i18n/config";
import { ADMIN_LOCALE_LABELS, type AdminLocaleLayout } from "@/lib/i18n/content/content-admin";

const LOCALE_LABELS = ADMIN_LOCALE_LABELS;

const DEFAULT_LAYOUT: AdminLocaleLayout = {
  root: "tr",
  translations: ["en", "de"],
  enabled: ["tr", "en", "de"],
  multilingual: true,
};

type Props = {
  typeId: string;
  /** Ana dil referans metni — bu panelden DÜZENLENEMEZ, yalnız gösterilir. */
  typeName: string;
};

export default function TypeTranslationsPanel({ typeId, typeName }: Props) {
  const toast = useNotify();
  const [layout, setLayout] = useState<AdminLocaleLayout>(DEFAULT_LAYOUT);
  const [forms, setForms] = useState<Partial<Record<Locale, string>>>({ en: "", de: "" });
  const [slugs, setSlugs] = useState<Partial<Record<Locale, string>>>({ en: "", de: "" });
  const [technicalKey, setTechnicalKey] = useState<string | null>(null);
  const [rootSlug, setRootSlug] = useState("");
  const [slugSeparated, setSlugSeparated] = useState(false);
  const [activeLocale, setActiveLocale] = useState<Locale>("en");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const result = await loadTypeTranslationsAction(typeId);
      if (cancelled) return;
      if (!result.ok) {
        toast.error("Çeviriler yüklenemedi", {
          id: `type-translations-load-${typeId}`,
          description: result.error,
        });
        setLoading(false);
        return;
      }
      const lay = result.layout ?? DEFAULT_LAYOUT;
      const nextForms: Partial<Record<Locale, string>> = {};
      const nextSlugs: Partial<Record<Locale, string>> = {};
      for (const l of lay.translations) {
        nextForms[l] = "";
        nextSlugs[l] = "";
      }
      for (const row of result.rows) {
        const l = row.locale as Locale;
        if (!lay.translations.includes(l)) continue;
        nextForms[l] = typeof row.name === "string" ? row.name : "";
        nextSlugs[l] = typeof row.slug === "string" ? row.slug : "";
      }
      setLayout(lay);
      setForms(nextForms);
      setSlugs(nextSlugs);
      setTechnicalKey(result.technicalKey ?? null);
      setRootSlug(result.rootSlug ?? "");
      setSlugSeparated(!!result.slugSeparated);
      setActiveLocale((prev) => (lay.translations.includes(prev) ? prev : lay.translations[0]));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeId]);

  /* base modunda TR URL slug'ı ancak migration 108 ile teknik anahtardan ayrılır. */
  const trSlugLocked = !slugSeparated;
  const slugLocked = (l: Locale) => l === "tr" && trSlugLocked;
  const missing = layout.translations.filter((l) => !(forms[l] ?? "").trim());

  async function handleSave() {
    const current = forms[activeLocale] ?? "";
    if (!current.trim()) {
      toast.error("İsim gerekli", { id: `type-translations-save-${typeId}` });
      return;
    }
    setSaving(true);
    try {
      const result = await saveTypeTranslationAction({
        typeId,
        locale: activeLocale,
        name: current,
        ...(slugLocked(activeLocale) ? {} : { slug: slugs[activeLocale] ?? "" }),
      });
      if (!result.ok) {
        toast.error("Kaydedilemedi", {
          id: `type-translations-save-${typeId}`,
          description: result.error,
        });
        return;
      }
      const row = result.row as { name?: string | null; slug?: string | null };
      setForms((prev) => ({ ...prev, [activeLocale]: row.name ?? current }));
      setSlugs((prev) => ({ ...prev, [activeLocale]: row.slug ?? "" }));
      toast.success(`${LOCALE_LABELS[activeLocale]} çevirisi kaydedildi`, {
        id: `type-translations-save-${typeId}`,
      });
      revalidateTaxonomy().catch(() => {});
      revalidateMenu().catch(() => {});
    } finally {
      setSaving(false);
    }
  }

  async function handleRootSlugSave() {
    setSaving(true);
    try {
      const r = await saveTypeRootSlugAction({ typeId, slug: rootSlug });
      if (!r.ok) {
        toast.error("Kaydedilemedi", { id: `type-root-slug-${typeId}`, description: r.error });
        return;
      }
      setRootSlug(r.slug ?? "");
      toast.success(`${LOCALE_LABELS[layout.root]} adresi kaydedildi`, { id: `type-root-slug-${typeId}` });
      revalidateTaxonomy().catch(() => {});
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card-premium p-4 mt-2 space-y-4">
      <div>
        <p className="text-[11px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-400)]">
          {LOCALE_LABELS[layout.root]} (referans, salt okunur)
        </p>
        <p className="text-sm text-[var(--color-stone-600)] mt-1">{typeName}</p>
      </div>

      {!loading && technicalKey && (
        <div className="rounded-lg bg-[var(--color-sand-50)] px-3 py-2 space-y-2">
          <p className="text-[12px] text-[var(--color-stone-500)]">
            Teknik anahtar (değişmez):{" "}
            <code className="text-[var(--color-stone-800)]" data-testid="technical-key">
              {technicalKey}
            </code>
          </p>
          <LocalizedSlugField
            kind="villaType"
            locale={layout.root}
            value={rootSlug}
            baseSlug={technicalKey}
            disabled={slugLocked(layout.root) || saving}
            onChange={setRootSlug}
          />
          {slugLocked(layout.root) ? (
            <p className="text-[11px] text-[var(--color-stone-400)]">
              Türkçe URL slug&apos;ı şu an teknik anahtarla aynı; ayrı düzenleme için veritabanında dil slug
              ayrımı (migration 108) gerekir.
            </p>
          ) : (
            <button
              type="button"
              onClick={handleRootSlugSave}
              disabled={saving}
              className="text-[12px] font-medium text-[var(--color-champagne-700)]"
            >
              {LOCALE_LABELS[layout.root]} adresini kaydet
            </button>
          )}
        </div>
      )}

      <div className="flex gap-2">
        {layout.translations.map((locale) => (
          <button
            key={locale}
            type="button"
            onClick={() => setActiveLocale(locale)}
            title={!loading && missing.includes(locale) ? "Bu dilde çeviri eksik" : undefined}
            className={
              activeLocale === locale
                ? "rounded-full bg-[var(--color-stone-900)] px-3 py-1 text-xs font-semibold text-white"
                : "rounded-full bg-[var(--color-stone-100)] px-3 py-1 text-xs font-semibold text-[var(--color-stone-600)]"
            }
          >
            {LOCALE_LABELS[locale]}
            {!loading && missing.includes(locale) && (
              <span aria-hidden="true" className="ml-1 text-amber-500">●</span>
            )}
          </button>
        ))}
      </div>

      {!loading && missing.length > 0 && (
        <p className="text-[12px] text-amber-700" data-testid="missing-translations">
          Eksik çeviri: {missing.map((l) => LOCALE_LABELS[l]).join(", ")} — eksik dilde içerik ana dilden
          gösterilir ve sayfa arama motorlarına kapalı tutulur.
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
            aria-label={LOCALE_LABELS[activeLocale]}
            className="input"
            maxLength={200}
            value={forms[activeLocale] ?? ""}
            onChange={(e) => setForms((prev) => ({ ...prev, [activeLocale]: e.target.value }))}
          />
          <LocalizedSlugField
            kind="villaType"
            locale={activeLocale}
            value={slugs[activeLocale] ?? ""}
            baseSlug={technicalKey}
            disabled={slugLocked(activeLocale)}
            onChange={(v) => setSlugs((prev) => ({ ...prev, [activeLocale]: v }))}
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
              `${LOCALE_LABELS[activeLocale]} sürümünü kaydet`
            )}
          </button>
        </div>
      )}
    </div>
  );
}
