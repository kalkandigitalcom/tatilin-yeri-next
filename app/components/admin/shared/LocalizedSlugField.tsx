"use client";

import { buildRoutePath } from "@/lib/i18n/routing/url";
import type { RouteKey, SlugKind } from "@/lib/i18n/routing/route-registry";
import { checkLocalizedSlugFormat } from "@/lib/i18n/routing/slug-validation";

/* ===============================================================
   🌐 DİL BAZLI SEO SLUG ALANI — Çok Dilli Mimari Faz 2 (admin)
   ===============================================================
   Çeviri kartlarında (villa, villa tipi, blog, CMS sayfası) o dilin
   URL slug'ı. Boş bırakılırsa o dilde Türkçe slug kullanılır. Biçim
   anında kontrol edilir; çakışma kontrolü kayıtta sunucudadır.
   =============================================================== */

const ROUTE_OF: Record<SlugKind, RouteKey> = {
  villa: "villa",
  villaType: "villaType",
  blog: "blogPost",
  page: "page",
};

export default function LocalizedSlugField({
  kind,
  locale,
  value,
  onChange,
  baseSlug,
  disabled,
}: {
  kind: SlugKind;
  locale: "en" | "de";
  value: string;
  onChange: (next: string) => void;
  /** Kaydın Türkçe (taban) slug'ı — önizleme için. */
  baseSlug?: string | null;
  disabled?: boolean;
}) {
  const check = checkLocalizedSlugFormat(kind, value);
  const effective = check.ok ? check.slug ?? baseSlug ?? "" : null;
  const preview =
    effective !== null && effective
      ? buildRoutePath(ROUTE_OF[kind], { slug: effective }, locale, {
          root: "tr",
          enabled: ["tr", locale],
          slugs: {},
        })
      : null;
  const inputId = `localized-slug-${kind}-${locale}`;

  return (
    <div>
      <label
        htmlFor={inputId}
        className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)] block"
      >
        URL (SEO slug) — {locale.toUpperCase()}
      </label>
      <input
        id={inputId}
        className="input"
        maxLength={160}
        value={value}
        disabled={disabled}
        placeholder={baseSlug ?? "ornek-adres"}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!check.ok}
        aria-describedby={`${inputId}-hint`}
      />
      <p
        id={`${inputId}-hint`}
        className={
          "mt-1 text-xs " +
          (check.ok ? "text-[var(--color-stone-400)]" : "text-red-600")
        }
      >
        {!check.ok
          ? check.error
          : check.slug
            ? `Adres: ${preview}`
            : `Boş bırakılırsa Türkçe adres kullanılır${preview ? `: ${preview}` : ""}. Küçük harf, rakam ve tire.`}
      </p>
    </div>
  );
}
