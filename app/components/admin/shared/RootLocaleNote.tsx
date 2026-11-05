"use client";

/* 🌐 Faz 5 — sayfa başında: ana formun hangi dili düzenlediği. Ana dil
   settings.public_default_locale'dir; diğer diller "Çeviriler" bölümünde.
   Satır bazında eksik çeviri rozetleri için MissingLocalesBadge. */

import { ADMIN_LOCALE_LABELS, ADMIN_LOCALE_SHORT } from "@/lib/i18n/content/content-admin";
import type { Locale } from "@/lib/i18n/config";
import { useAdminLocaleLayout } from "@/app/components/admin/shared/useAdminLocaleLayout";

export default function RootLocaleNote({ scope = "list" }: { scope?: "list" | "form" } = {}) {
  const layout = useAdminLocaleLayout();
  if (!layout.multilingual) return null;
  return (
    <p className="text-[12px] text-[var(--color-stone-500)] mt-1" data-testid="root-locale-note">
      Ana dil: <strong>{ADMIN_LOCALE_LABELS[layout.root]}</strong> — {scope === "form" ? "bu formdaki çevrilebilir metinler" : "liste"} ana dildeki metni düzenler; diğer diller
      ({layout.translations.map((l) => ADMIN_LOCALE_SHORT[l]).join(", ")}) &ldquo;Çeviriler&rdquo; bölümünden.
    </p>
  );
}

export function MissingLocalesBadge({ missing }: { missing?: readonly Locale[] | null }) {
  if (!missing || missing.length === 0) return null;
  return (
    <span
      className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700"
      title={`Eksik çeviri: ${missing.map((l) => ADMIN_LOCALE_LABELS[l]).join(", ")}`}
      data-testid="missing-locales-badge"
    >
      Eksik: {missing.map((l) => ADMIN_LOCALE_SHORT[l]).join(" ")}
    </span>
  );
}
