import { isSupportedLocale, type Locale } from "@/lib/i18n/config";
import type { ContentEntityDef } from "@/lib/i18n/content/content-registry";
import { checkLocalizedSlugFormat } from "@/lib/i18n/routing/slug-validation";
import { POPUP_LIMITS } from "@/lib/site-popup";
import { BASE_MIRROR_LOCALE } from "@/lib/i18n/content/content-field-rules";

/* ===============================================================
   🌐 MERKEZİ İÇERİK YAZMA — PAYLOAD DOĞRULAMA (Seçenek D, Faz 4, SAF)
   ===============================================================
   • Yalnız registry'deki çevrilebilir alanlar (+ slugKind'li varlıkta
     `slug`) kabul edilir. Teknik alanlar (id, locale, parent FK,
     created_at …) ve bilinmeyen anahtarlar REDDEDİLİR.
   • EKSİK / NULL / BOŞ ayrımı korunur:
       anahtar yok      → o alana DOKUNULMAZ (kısmi güncelleme)
       null             → NULL yazılır
       "" (boş metin)   → "" yazılır (normalize EDİLMEZ; okuma tarafı
                          boşu zaten yedeğe düşürür)
   • Metin alanı string|null olmalı. jsonb: sections dizi|null;
     stats metin dizisi (≤4, NOT NULL — 096 CHECK'i).
   • site_popup uzunlukları 096 CHECK'leriyle aynı (POPUP_LIMITS).
   • slug: mevcut checkLocalizedSlugFormat (102 formatı + ayrılmış
     kelimeler, güvenli normalizasyon). Boş → null.
   NOT NULL ana kolon kontrolü şemaya bağlıdır → çekirdekte, DB'den.
   =============================================================== */

export type ValidatedContentPayload = {
  /** Yazılacak alanlar (yalnız gönderilenler). */
  fields: Record<string, unknown>;
  /** `undefined` = slug gönderilmedi; null = temizle. */
  slug?: string | null;
};

export type ContentPayloadValidation =
  | { ok: true; value: ValidatedContentPayload }
  | { ok: false; error: string; field?: string; code: "validation" };

const POPUP_TEXT_LIMITS: Record<string, number> = {
  title: POPUP_LIMITS.title,
  description: POPUP_LIMITS.description,
  highlight_text: POPUP_LIMITS.highlight,
  button_text: POPUP_LIMITS.buttonText,
  button_url: POPUP_LIMITS.buttonUrl,
};

const fail = (error: string, field?: string): ContentPayloadValidation => ({
  ok: false,
  error,
  field,
  code: "validation",
});

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
}

function isJsonSerializable(v: unknown): boolean {
  try {
    return JSON.stringify(v) !== undefined;
  } catch {
    return false;
  }
}

export function validateContentPayload(
  def: ContentEntityDef,
  locale: unknown,
  patch: unknown
): ContentPayloadValidation {
  if (!isSupportedLocale(locale)) return fail(`Geçersiz dil: ${String(locale)}`, "locale");
  if (!isPlainObject(patch)) return fail("Yazılacak alanlar bir nesne olmalı");

  const keys = Object.keys(patch);
  if (keys.length === 0) return fail("En az bir alan gönderilmeli");

  const byName = new Map(def.fields.map((f) => [f.name, f]));
  const out: ValidatedContentPayload = { fields: {} };

  for (const key of keys) {
    const value = patch[key];
    if (value === undefined) continue; // undefined = gönderilmedi

    if (key === "slug") {
      if (!def.slugKind) return fail(`${def.key} dil bazlı slug taşımaz`, "slug");
      if (value !== null && typeof value !== "string") return fail("slug metin veya null olmalı", "slug");
      const r = checkLocalizedSlugFormat(def.slugKind, value as string | null);
      if (!r.ok) return fail(r.error, "slug");
      out.slug = r.slug;
      continue;
    }

    const field = byName.get(key);
    if (!field) return fail(`Bilinmeyen veya yazılamaz alan: ${key}`, key);

    if (field.kind === "text") {
      if (value !== null && typeof value !== "string") return fail(`${key} metin veya null olmalı`, key);
      if (def.key === "site_popup" && typeof value === "string") {
        const max = POPUP_TEXT_LIMITS[key];
        if (max !== undefined && value.length > max) return fail(`${key} en fazla ${max} karakter olabilir`, key);
      }
    } else {
      if (!isJsonSerializable(value)) return fail(`${key} geçerli JSON olmalı`, key);
      if (key === "stats") {
        if (!Array.isArray(value)) return fail("stats bir dizi olmalı (boş için [])", key);
        if (value.length > POPUP_LIMITS.statsCount) return fail(`stats en fazla ${POPUP_LIMITS.statsCount} öğe olabilir`, key);
        if (!value.every((x) => typeof x === "string")) return fail("stats öğeleri metin olmalı", key);
      } else if (value !== null && !Array.isArray(value)) {
        return fail(`${key} bir dizi veya null olmalı`, key);
      }
    }
    out.fields[key] = value;
  }

  if (Object.keys(out.fields).length === 0 && out.slug === undefined) {
    return fail("En az bir alan gönderilmeli");
  }
  return { ok: true, value: out };
}

/** Hangi tarafa yazılacağı (mod + dil). Ana dil (root) BELİRLEYİCİ DEĞİL:
 *  ana dil değişince içerik taşınmaz. */
export type ContentMirrorModeValue = "base" | "translations";

export function contentWriteTarget(
  locale: Locale,
  mode: ContentMirrorModeValue
): "base" | "translation" {
  /* Karar 1: ana tablo kolonları BASE_MIRROR_LOCALE (TR) aynasıdır. */
  return mode === "base" && locale === BASE_MIRROR_LOCALE ? "base" : "translation";
}
