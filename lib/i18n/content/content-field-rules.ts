import { parsePageSections } from "@/lib/page-sections";
import {
  POPUP_LIMITS,
  cleanPopupText,
  isSafePopupUrl,
  normalizePopupStats,
} from "@/lib/site-popup";
import type { Locale } from "@/lib/i18n/config";
import type {
  ContentEntityDef,
  ContentEntityKey,
  ContentField,
} from "@/lib/i18n/content/content-registry";
import { isEmptyContentValue } from "@/lib/i18n/content/content-resolve-empty";

/* ===============================================================
   🌐 ALAN KURALLARI — Faz 3.1 uyumluluk (SAF)
   ===============================================================
   Eski okuma katmanlarındaki "bu alan dolu mu?" ve "çeviri var mı?"
   kararlarının merkezi servisteki karşılıkları. Kaynak kurallar
   YENİDEN YAZILMADI; aynı saf fonksiyonlar import edilir:

   1) DOLULUK (alan bazında yedek kararı)
      • page.sections  → parsePageSections(v).length > 0
        (eski resolveTranslatedSections: geçersiz bölümlerden oluşan
        dizi "boş" sayılır, canonical'e düşer)
      • site_popup.*   → cleanPopupText / normalizePopupStats /
        isSafePopupUrl (eski popupTranslationText + mergePopupText:
        yalnız etiket/boşluk olan metin, güvensiz URL "boş" sayılır)
      • diğerleri      → isEmptyContentValue (trim() !== "", jsonb boş)

   2) ÇEVİRİ VAR SAYILMA (isFallback / noindex — karar 5)
      • blog_post, page → title | body | excerpt'ten biri istenen dilde
        dolu olmalı (eski content-availability.server.ts
        translatedLocalesFromRows ile AYNI alanlar; seo_* ve sections
        tek başına "çeviri" saymaz)
      • diğerleri → herhangi bir çevrilebilir alan

   3) ANA TABLO EK YEDEĞİ (eski çapraz kolon yedeği)
      • page.body ← pages.content  (eski canonicalBody: body ?? content)
        Faz 5 sözleşmesi: TR body NULL = "değer yok" → eski content
        gösterilir; TR body "" = "BİLEREK boşaltıldı" → content GÖSTERİLMEZ.
        Admin "gövdeyi temizle" daima "" gönderir (content-contract).
        Ana tablo kolonları kalıcı TR aynasıdır (onaylı karar 1); bu
        yüzden ek yedek YALNIZ ana-tablo-aynası dilinin (TR) satırına
        uygulanır ve o dil zincirde (aktif) değilse KULLANILMAZ.
   =============================================================== */

/** Onaylı karar 1: ana tablodaki eski kolonlar bu dilin kalıcı aynasıdır. */
export const BASE_MIRROR_LOCALE: Locale = "tr";

type FilledFn = (value: unknown) => boolean;

const text = (max: number, multiline = false): FilledFn => (v) =>
  cleanPopupText(v, max, { multiline }) !== null;

export const CONTENT_FIELD_FILLED_OVERRIDES: Partial<
  Record<ContentEntityKey, Readonly<Record<string, FilledFn>>>
> = {
  page: {
    sections: (v) => parsePageSections(v).length > 0,
  },
  site_popup: {
    title: text(POPUP_LIMITS.title),
    description: text(POPUP_LIMITS.description, true),
    highlight_text: text(POPUP_LIMITS.highlight),
    stats: (v) => normalizePopupStats(v).length > 0,
    button_text: text(POPUP_LIMITS.buttonText),
    button_url: (v) => typeof v === "string" && isSafePopupUrl(v.trim()),
  },
};

export function isContentFieldFilled(
  def: Pick<ContentEntityDef, "key">,
  field: ContentField,
  value: unknown
): boolean {
  const override = CONTENT_FIELD_FILLED_OVERRIDES[def.key]?.[field.name];
  if (override) {
    try {
      return override(value);
    } catch {
      return false;
    }
  }
  return !isEmptyContentValue(value, field.kind);
}

/* ---------------------------------------------------------------
   4) BİLİNÇLİ BOŞ İÇERİK (Faz 5 son kontroller)
   ---------------------------------------------------------------
   Blog ve CMS sayfası GÖVDESİ bir dilde "" ise kullanıcı
   onu BİLEREK boşaltmıştır (admin ana formu boşaltılan gövdeyi ""
   yazar). Bu durumda:
     • yedek zinciri o dilde DURUR → başka dilin gövdesi GÖSTERİLMEZ;
     • eski `pages.content` metni de geri gelmez (applyBaseSupplements
       yalnız NULL'u doldurur);
     • alan "çeviri var" SAYILMAZ (noindex kararı değişmez) ve
       `missing` listesinde kalır (içerik yok).
   Sözleşme (yazma):  anahtar yok → dokunulmaz;  NULL → değer yok
   (zincir devam eder, eski content yedeği dahil);  "" → bilinçli boş.
   Yalnız boşluktan oluşan metin ("  ") de aynı sınıftadır: 1. dalga
   kararıyla (applyBaseSupplements) zaten "bilerek boşaltıldı" sayılıyor
   ve eski content'i getirmiyordu; zincirde de tutarlı davranır. Kısacası
   gövde için: METİN (boş dahil) = bilinçli değer, NULL = değer yok.
   Diğer alanların yedek davranışı DEĞİŞMEZ. */
export const CONTENT_EXPLICIT_EMPTY_FIELDS: Partial<Record<ContentEntityKey, readonly string[]>> = {
  blog_post: ["body"],
  page: ["body"],
};

export function isExplicitEmptyContent(
  def: Pick<ContentEntityDef, "key">,
  field: Pick<ContentField, "name">,
  value: unknown
): boolean {
  return (
    typeof value === "string" &&
    value.trim() === "" &&
    (CONTENT_EXPLICIT_EMPTY_FIELDS[def.key]?.includes(field.name) ?? false)
  );
}

/** "Bu dilde gerçek çeviri var" kararının dayandığı alanlar. */
export const CONTENT_AVAILABILITY_FIELDS: Partial<Record<ContentEntityKey, readonly string[]>> = {
  blog_post: ["title", "body", "excerpt"],
  page: ["title", "body", "excerpt"],
};

export function availabilityFields(def: ContentEntityDef): readonly string[] {
  return CONTENT_AVAILABILITY_FIELDS[def.key] ?? def.fields.map((f) => f.name);
}

export type BaseSupplement = {
  /** Çeviri tablosundaki alan (registry). */
  field: string;
  /** Ana tablodaki eski yedek kolon. */
  baseColumn: string;
};

/** Ana tablo ek yedekleri. Kolonun canlı şemada varlığı çalışma anında
 *  doğrulanır (information_schema); yoksa ek yedek atlanır. */
export const CONTENT_BASE_SUPPLEMENTS: Partial<Record<ContentEntityKey, readonly BaseSupplement[]>> = {
  page: [{ field: "body", baseColumn: "content" }],
};
