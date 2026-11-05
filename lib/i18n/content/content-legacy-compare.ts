import type { Locale } from "@/lib/i18n/config";
import type { ContentEntityDef, ContentField } from "@/lib/i18n/content/content-registry";
import type { ContentValues, LocalizedContent } from "@/lib/i18n/content/content-contract";
import type { ContentRow } from "@/lib/i18n/content/content-resolve";
import { isContentFieldFilled } from "@/lib/i18n/content/content-field-rules";

/* ===============================================================
   🌐 ESKİ ↔ YENİ OKUMA KARŞILAŞTIRMASI (Seçenek D, Faz 3, SAF, TEŞHİS)
   ===============================================================
   Hiçbir çalışan yol bunu kullanmaz; testler ve Faz 4 geçiş doğrulaması
   içindir. Eski okuma kuralı (lib/i18n/get-*.server.ts):
     • TR  → daima ANA TABLO kolonu (çeviri tablosuna hiç bakılmaz).
     • EN/DE → çeviri satırı doluysa o (metin: trim() !== ""; jsonb:
       boş olmayan dizi — page.sections / site_popup.stats), değilse
       ANA TABLO (TR) değeri. Ana dil ve aktif/pasif durumu YOK SAYILIR.
     • slug: TR → ana tablo slug'ı; EN/DE → çeviri slug'ı (yoksa null).
   =============================================================== */

export type LegacySource = "base" | Locale | null;

export type LegacyResolved = {
  values: ContentValues;
  source: Record<string, LegacySource>;
  slug?: string | null;
};

export type ContentDiffReason =
  /** Eski boş gösteriyordu, yeni başka aktif dilden dolduruyor. */
  | "fills-gap"
  /** İkisi de dolu ama farklı dilden (ana dil ≠ TR veya zincir farkı). */
  | "fallback-order"
  | "mirror-drift"
  | "empty-normalization"
  | "passive-or-missing-tr"
  | "slug"
  | "other";

export type ContentFieldDiff = {
  field: string;
  legacy: unknown;
  next: unknown;
  legacySource: LegacySource;
  nextSource: Locale | null;
  reason: ContentDiffReason;
};

/* Eski "çeviri alanı dolu mu" kararı. Metin: trim() !== "" (resolveTranslatedField);
   page.sections: parsePageSections; site_popup: cleanPopupText/normalizePopupStats/
   isSafePopupUrl — merkezi servis AYNI saf fonksiyonları kullanır
   (content-field-rules), bu yüzden kural burada da paylaşılır. */
function legacyFilled(def: ContentEntityDef, v: unknown, field: ContentField): boolean {
  return isContentFieldFilled(def, field, v);
}

/* Eski canonical (TR ana tablo) değeri. page.body: `body ?? content`
   (lib/i18n/get-page-translation.server.ts canonicalBody). */
function legacyCanonical(def: ContentEntityDef, base: ContentValues, field: ContentField): unknown {
  const v = base[field.baseColumn] ?? null;
  if (def.key === "page" && field.name === "body") return v ?? base.content ?? null;
  return v;
}

export function resolveLegacy(
  def: ContentEntityDef,
  base: ContentValues & { slug?: string | null },
  byLocale: Partial<Record<Locale, ContentRow>>,
  requested: Locale
): LegacyResolved {
  const values: ContentValues = {};
  const source: Record<string, LegacySource> = {};
  const row = requested === "tr" ? undefined : byLocale[requested];
  for (const field of def.fields) {
    const t = row?.values[field.name];
    if (row && legacyFilled(def, t, field)) {
      values[field.name] = t;
      source[field.name] = requested;
    } else {
      values[field.name] = legacyCanonical(def, base, field);
      source[field.name] = "base";
    }
  }
  const out: LegacyResolved = { values, source };
  if (def.slugKind) out.slug = requested === "tr" ? (base.slug ?? null) : (row?.slug ?? null);
  return out;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export function diffLegacyVsNext(
  def: ContentEntityDef,
  legacy: LegacyResolved,
  next: LocalizedContent | null,
  byLocale: Partial<Record<Locale, ContentRow>>
): ContentFieldDiff[] {
  const diffs: ContentFieldDiff[] = [];
  for (const field of def.fields) {
    const lv = legacy.values[field.name] ?? null;
    const nv = next?.values[field.name] ?? null;
    if (same(lv, nv)) continue;
    const ls = legacy.source[field.name] ?? null;
    const ns = next?.sourceLocale[field.name] ?? null;
    let reason: ContentDiffReason = "other";
    /* "Boş" = alan kuralına göre (content-field-rules): ör. geçersiz bölüm
       dizisi eski katmanda ham döner ama render'da parsePageSections → []
       olur; görsel sonuç boştur → normalizasyon farkı sayılır. */
    const legacyEmpty = !isContentFieldFilled(def, field, lv);
    if (ns === null && legacyEmpty) reason = "empty-normalization";
    else if (ns !== null && legacyEmpty) reason = "fills-gap";
    else if (ns === null) reason = "passive-or-missing-tr";
    else if (ls === "base" && ns === "tr") {
      const trv = byLocale.tr?.values[field.name];
      reason = same(trv, lv) ? "other" : "mirror-drift";
    } else if (ls === "base" && ns !== "tr") reason = "fallback-order";
    else if (ls !== "base" && ns !== ls) reason = "fallback-order";
    diffs.push({ field: field.name, legacy: lv, next: nv, legacySource: ls, nextSource: ns, reason });
  }
  if (def.slugKind) {
    const ls = legacy.slug ?? null;
    const ns = next?.slug ?? null;
    if (!same(ls, ns)) {
      diffs.push({
        field: "slug",
        legacy: ls,
        next: ns,
        legacySource: legacy.slug === undefined ? null : "base",
        nextSource: next?.requestedLocale ?? null,
        reason: "slug",
      });
    }
  }
  return diffs;
}

/* ---------------------------------------------------------------
   Eski SEO kararı (blog / CMS sayfası) — content-availability.server.ts
   translatedLocalesFromRows: TR daima mevcut; EN/DE yalnız title|body|
   excerpt dolu bir çeviri satırı varsa. Mevcut değilse noindex,follow.
   --------------------------------------------------------------- */
export function legacyTextAvailable(
  byLocale: Partial<Record<Locale, ContentRow>>,
  requested: Locale
): boolean {
  if (requested === "tr") return true;
  const r = byLocale[requested];
  const has = (v: unknown) => typeof v === "string" && v.trim().length > 0;
  return !!r && (has(r.values.title) || has(r.values.body) || has(r.values.excerpt));
}
