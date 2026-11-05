"use client";

/* ===============================================================
   🛡️ PHASE 10A — ADMIN VILLA TRANSLATION UI
   ===============================================================
   EN / DE çeviri alanlarını (description, badge, seo_title,
   seo_description) düzenlemek için self-contained kart.
   🛡️ VİLLA ADI (title) BURADA DÜZENLENMEZ — özel isimdir, her locale'de
   canonical `villa.title` gösterilir. IcalSyncCard.tsx
   deseniyle AYNI prensip: kendi state'i, kendi save mekanizması —
   ana wizard "Güncelle" akışına (handleUpdate/buildVillaUpdatePayload)
   KARIŞMAZ.

   TR bu ekrandan DÜZENLENEMEZ — yalnız EN/DE. Boş alanlar public
   tarafta TR'ye fallback eder (bu ekranda değiştirilmiyor).
   =============================================================== */

import LocalizedSlugField from "@/app/components/admin/shared/LocalizedSlugField";
import { useEffect, useState } from "react";
import type { Locale } from "@/lib/i18n/config";
import { ADMIN_LOCALE_LABELS } from "@/lib/i18n/content/content-admin";
import { useAdminLocaleLayout } from "@/app/components/admin/shared/useAdminLocaleLayout";
import { Languages, Loader2 } from "lucide-react";

import { useNotify } from "@/app/components/admin/notifications/NotificationProvider";
import {
  loadVillaTranslationsAction,
  saveVillaRootSlugAction,
  saveVillaTranslationAction,
} from "./villa-translations.action";

/* 🌐 Faz 5 dalga 2 — düzenlenen diller = ana dil DIŞINDAKİ iki dil. */
type WritableLocale = Locale;

type LocaleFormState = {
  description: string;
  badge: string;
  seoTitle: string;
  /* 🌐 Faz 2 — bu dildeki SEO URL slug'ı. */
  slug: string;
  seoDescription: string;
};

const EMPTY_FORM: LocaleFormState = {
  description: "",
  badge: "",
  seoTitle: "",
  slug: "",
  seoDescription: "",
};

const LOCALE_LABELS: Record<WritableLocale, string> = ADMIN_LOCALE_LABELS;

type Props = {
  villaId: string;
  villaTitle?: string | null;
};

export default function VillaTranslationsCard({ villaId }: Props) {
  const toast = useNotify();

  const layout = useAdminLocaleLayout();
  const editable = layout.translations;
  const rootLabel = LOCALE_LABELS[layout.root];
  const [forms, setForms] = useState<Record<WritableLocale, LocaleFormState>>({
    tr: EMPTY_FORM,
    en: EMPTY_FORM,
    de: EMPTY_FORM,
  });
  const [selectedLocale, setActiveLocale] = useState<WritableLocale>(editable[0] ?? "en");
  /* Ana dil değişince (düzen geç yüklenir) seçili sekme geçersiz kalırsa
     ilk düzenlenebilir dile düşülür — türetilmiş değer, effect yok. */
  const activeLocale: WritableLocale = editable.includes(selectedLocale) ? selectedLocale : editable[0];
  /* 🌐 Faz 5 dalga 2 — teknik anahtar (salt okunur) + ana dil URL slug'ı. */
  const [technicalKey, setTechnicalKey] = useState<string | null>(null);
  const [rootSlug, setRootSlug] = useState("");
  const [slugSeparated, setSlugSeparated] = useState(true);
  const [savingRoot, setSavingRoot] = useState(false);
  const rootSlugLocked = layout.root === "tr" && !slugSeparated;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      const result = await loadVillaTranslationsAction(villaId);
      if (cancelled) return;

      if (!result.ok) {
        toast.error("Çeviriler yüklenemedi", {
          id: "villa-translations-load",
          description: result.error,
        });
        setLoading(false);
        return;
      }

      setForms((prev) => {
        const next = { ...prev };
        const t = (v: unknown) => (typeof v === "string" ? v : "");
        for (const row of result.rows) {
          const loc = row.locale as WritableLocale;
          if (loc !== "tr" && loc !== "en" && loc !== "de") continue;
          next[loc] = {
            description: t(row.description),
            badge: t(row.badge),
            seoTitle: t(row.seo_title),
            slug: t(row.slug),
            seoDescription: t(row.seo_description),
          };
        }
        return next;
      });
      if ("technicalKey" in result) {
        setTechnicalKey(typeof result.technicalKey === "string" ? result.technicalKey : null);
        setRootSlug(typeof result.rootSlug === "string" ? result.rootSlug : "");
        setSlugSeparated(result.slugSeparated !== false);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [villaId]);

  function setField(field: keyof LocaleFormState, value: string) {
    setForms((prev) => ({
      ...prev,
      [activeLocale]: { ...prev[activeLocale], [field]: value },
    }));
  }

  async function handleSave() {
    const current = forms[activeLocale];

    setSaving(true);
    try {
      const result = await saveVillaTranslationAction({
        villaId,
        locale: activeLocale,
        description: current.description,
        badge: current.badge,
        seoTitle: current.seoTitle,
        slug: current.slug,
        seoDescription: current.seoDescription,
      });

      if (!result.ok) {
        toast.error("Kaydedilemedi", {
          id: "villa-translations-save",
          description: result.error,
        });
        return;
      }

      toast.success(`${LOCALE_LABELS[activeLocale]} çevirisi kaydedildi`, {
        id: "villa-translations-save",
      });
    } finally {
      setSaving(false);
    }
  }

  const form = forms[activeLocale];

  return (
    <section className="card-premium p-6 md:p-8 space-y-6">
      <header className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-stone-100)] text-[var(--color-stone-700)]">
          <Languages className="h-5 w-5" />
        </span>
        <div>
          <p className="eyebrow">Çok Dilli İçerik</p>
          <h2 className="text-lg font-semibold text-[var(--color-stone-900)]">
            Çeviriler ({editable.map((l) => l.toUpperCase()).join(" / ")})
          </h2>
          <p className="mt-1 text-sm text-[var(--color-stone-500)]">
            Bu alanlar {editable.map((l) => LOCALE_LABELS[l]).join(" ve ")} sürümleri
            içindir. Ana dil ({rootLabel}) yukarıdaki formdan düzenlenir; boş
            bırakılan alanlar public tarafta ana dil içeriğine geri döner.
          </p>
        </div>
      </header>

      {technicalKey !== null ? (
        <div className="rounded-2xl border border-[var(--color-stone-100)] p-4 space-y-3" data-testid="villa-root-slug">
          <p className="text-[12px] text-[var(--color-stone-500)]">
            Teknik anahtar: <code>{technicalKey}</code> (değişmez; villa adı değişse de aynı kalır).
          </p>
          <LocalizedSlugField
            kind="villa"
            locale={layout.root}
            value={rootSlug}
            onChange={(v) => setRootSlug(v)}
          />
          {rootSlugLocked ? (
            <p className="text-[11px] text-amber-700">
              Türkçe URL slug&apos;ı, teknik anahtar ayrımı (migration 108) uygulanana kadar düzenlenemez.
            </p>
          ) : (
            <button
              type="button"
              className="btn-ghost disabled:opacity-60"
              disabled={savingRoot}
              onClick={async () => {
                setSavingRoot(true);
                try {
                  const r = await saveVillaRootSlugAction({ villaId, slug: rootSlug.trim() || null });
                  if (!r.ok) {
                    toast.error("Kaydedilemedi", { id: "villa-root-slug", description: r.error });
                    return;
                  }
                  setRootSlug(r.slug ?? "");
                  toast.success(`${rootLabel} URL slug'ı kaydedildi`, { id: "villa-root-slug" });
                } finally {
                  setSavingRoot(false);
                }
              }}
            >
              {rootLabel} URL slug&apos;ını kaydet
            </button>
          )}
        </div>
      ) : null}

      <div className="flex gap-2">
        {editable.map((locale) => (
          <button
            key={locale}
            type="button"
            onClick={() => setActiveLocale(locale)}
            className={
              activeLocale === locale
                ? "rounded-full bg-[var(--color-stone-900)] px-4 py-1.5 text-sm font-semibold text-white"
                : "rounded-full bg-[var(--color-stone-100)] px-4 py-1.5 text-sm font-semibold text-[var(--color-stone-600)]"
            }
          >
            {LOCALE_LABELS[locale]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-[var(--color-stone-500)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Yükleniyor…
        </div>
      ) : (
        <div className="space-y-5">
          <div>
            <label className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)] block">
              Açıklama
            </label>
            <textarea
              className="input !rounded-2xl !p-4 min-h-[110px] resize-none"
              maxLength={5000}
              value={form.description}
              onChange={(e) => setField("description", e.target.value)}
            />
          </div>

          <div>
            <label className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)] block">
              Rozet
            </label>
            <input
              className="input"
              maxLength={60}
              value={form.badge}
              onChange={(e) => setField("badge", e.target.value)}
            />
          </div>

          <LocalizedSlugField
            kind="villa"
            locale={activeLocale}
            value={form.slug}
            onChange={(v) => setField("slug", v)}
          />

          <div>
            <label className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)] block">
              SEO Başlık
            </label>
            <input
              className="input"
              maxLength={120}
              value={form.seoTitle}
              onChange={(e) => setField("seoTitle", e.target.value)}
            />
            <p className="mt-1 text-xs text-[var(--color-stone-400)]">
              Önerilen: 60 karakter
            </p>
          </div>

          <div>
            <label className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)] block">
              SEO Açıklama
            </label>
            <textarea
              className="input !rounded-2xl !p-4 min-h-[110px] resize-none"
              maxLength={300}
              value={form.seoDescription}
              onChange={(e) => setField("seoDescription", e.target.value)}
            />
            <p className="mt-1 text-xs text-[var(--color-stone-400)]">
              Önerilen: 160 karakter
            </p>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="btn-primary disabled:opacity-60"
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
    </section>
  );
}
