"use client";

/* ===============================================================
   🌐 Faz 5 — Fiyata dahil (price_include_items) çeviri paneli
   ===============================================================
   Ortak LocaleTranslationsPanel: referans = ANA DİL (liste satırında
   düzenlenir), sekmeler = diğer iki dil. Ana dil TR iken görünüm eskisiyle
   aynıdır (TR referans, EN/DE sekmeleri).
   =============================================================== */

import LocaleTranslationsPanel from "@/app/components/admin/shared/LocaleTranslationsPanel";
import {
  loadPriceIncludeTranslationsAction,
  savePriceIncludeTranslationAction,
} from "./price-include-translations.action";

type Props = {
  includeId: string;
  /** Ana dil referans metni — bu panelden DÜZENLENEMEZ. */
  includeTitle: string;
};

export default function PriceIncludeTranslationsPanel({ includeId, includeTitle }: Props) {
  return (
    <LocaleTranslationsPanel
      recordId={includeId}
      referenceValue={includeTitle}
      field="title"
      requiredMessage="Başlık gerekli"
      toastPrefix="price-include"
      maxLength={200}
      load={loadPriceIncludeTranslationsAction}
      save={(locale, title) => savePriceIncludeTranslationAction({ includeId, locale, title })}
    />
  );
}
