"use client";

/* ===============================================================
   🌐 Faz 5 — Koleksiyon başlığı (custom_title) çevirileri
   ===============================================================
   Ana sayfa / indirim koleksiyonu satırının altında açılır. Ana dil
   başlığı satırda düzenlenir; burada diğer iki dil. Boş bırakılan dilde
   ana dil başlığı, o da yoksa villa adı gösterilir (mevcut kural).
   =============================================================== */

import { useState } from "react";
import { Languages } from "lucide-react";

import LocaleTranslationsPanel, {
  type LocaleTranslationsLoadResult,
  type LocaleTranslationsSaveResult,
} from "@/app/components/admin/shared/LocaleTranslationsPanel";
import type { Locale } from "@/lib/i18n/config";

export default function CollectionTitleTranslations({
  itemId,
  referenceTitle,
  load,
  save,
}: {
  itemId: string;
  referenceTitle: string;
  load: (id: string) => Promise<LocaleTranslationsLoadResult>;
  save: (input: { id: string; locale: Locale; custom_title: string }) => Promise<LocaleTranslationsSaveResult>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="pl-12">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--color-stone-500)] hover:text-[var(--color-stone-800)] px-2 py-1"
      >
        <Languages size={12} />
        Başlık çevirileri
      </button>
      {open && (
        <LocaleTranslationsPanel
          recordId={itemId}
          referenceValue={referenceTitle}
          field="custom_title"
          requiredMessage=""
          allowEmpty
          toastPrefix="collection-title"
          load={load}
          save={(locale, value) => save({ id: itemId, locale, custom_title: value })}
        />
      )}
    </div>
  );
}
