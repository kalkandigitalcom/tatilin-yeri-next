"use client";

/* ===============================================================
   🌐 Faz 5 — Olanak (villa_features) çeviri paneli
   ===============================================================
   Ortak LocaleTranslationsPanel: referans = ANA DİL (liste satırında
   düzenlenir), sekmeler = diğer iki dil. Ana dil TR iken görünüm eskisiyle
   aynıdır (TR referans, EN/DE sekmeleri).
   =============================================================== */

import LocaleTranslationsPanel from "@/app/components/admin/shared/LocaleTranslationsPanel";
import {
  loadFeatureTranslationsAction,
  saveFeatureTranslationAction,
} from "./feature-translations.action";

type Props = {
  featureId: string;
  /** Ana dil referans metni — bu panelden DÜZENLENEMEZ. */
  featureName: string;
};

export default function FeatureTranslationsPanel({ featureId, featureName }: Props) {
  return (
    <LocaleTranslationsPanel
      recordId={featureId}
      referenceValue={featureName}
      field="name"
      requiredMessage="İsim gerekli"
      toastPrefix="feature"
      load={loadFeatureTranslationsAction}
      save={(locale, name) => saveFeatureTranslationAction({ featureId, locale, name })}
    />
  );
}
