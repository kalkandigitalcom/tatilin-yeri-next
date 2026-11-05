"use client";

/* ===============================================================
   🌐 Faz 5 — Kural (rule_items) çeviri paneli
   ===============================================================
   Ortak LocaleTranslationsPanel: referans = ANA DİL (liste satırında
   düzenlenir), sekmeler = diğer iki dil. Ana dil TR iken görünüm eskisiyle
   aynıdır (TR referans, EN/DE sekmeleri).
   =============================================================== */

import LocaleTranslationsPanel from "@/app/components/admin/shared/LocaleTranslationsPanel";
import {
  loadRuleTranslationsAction,
  saveRuleTranslationAction,
} from "./rule-translations.action";

type Props = {
  ruleId: string;
  /** Ana dil referans metni — bu panelden DÜZENLENEMEZ. */
  ruleTitle: string;
};

export default function RuleTranslationsPanel({ ruleId, ruleTitle }: Props) {
  return (
    <LocaleTranslationsPanel
      recordId={ruleId}
      referenceValue={ruleTitle}
      field="title"
      requiredMessage="Başlık gerekli"
      toastPrefix="rule"
      maxLength={200}
      load={loadRuleTranslationsAction}
      save={(locale, title) => saveRuleTranslationAction({ ruleId, locale, title })}
    />
  );
}
