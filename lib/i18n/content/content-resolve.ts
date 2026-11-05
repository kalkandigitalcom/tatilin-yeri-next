import type { Locale } from "@/lib/i18n/config";
import type { ContentEntityDef } from "@/lib/i18n/content/content-registry";
import type { ContentValues, LocalizedContent } from "@/lib/i18n/content/content-contract";
import { isEmptyContentValue } from "@/lib/i18n/content/content-resolve-empty";
import {
  BASE_MIRROR_LOCALE,
  availabilityFields,
  isContentFieldFilled,
  isExplicitEmptyContent,
} from "@/lib/i18n/content/content-field-rules";

export { isEmptyContentValue };

/* ===============================================================
   🌐 MERKEZİ İÇERİK OKUMA — SAF ÇÖZÜMLEYİCİ (Seçenek D, Faz 3)
   ===============================================================
   DB / Next / React bağımlılığı YOK. Repository'nin döndürdüğü ham
   çeviri satırlarını (her dil için en fazla bir satır) yedek zinciri
   üzerinden alan bazında çözer.

   KURALLAR
     • Zincir dışarıdan verilir (contentFallbackChain): istenen dil →
       ana dil → diğer aktif diller. Pasif dil zincirde YOKTUR; satırı
       veritabanında olsa bile değer olarak KULLANILMAZ.
     • TR'ye özel durum YOK: TR de EN/DE gibi bir çeviri satırıdır.
     • Boş değer: NULL/undefined, yalnız boşluktan oluşan metin,
       jsonb'de null / [] / {} / "" — ve Faz 3.1'de alan bazında eski
       kurallar (content-field-rules.ts: page.sections geçerli bölüm,
       site_popup temizlenmiş metin / güvenli URL).
     • Dolu metin KIRPILMADAN döner (eski davranışla aynı).
     • Slug yalnız İSTENEN dilin satırından gelir; başka dilin slug'ı
       yanlış URL üreteceği için yedeğe düşmez (yoksa null).
     • Teknik alanlar (id, parent FK, locale, created_at/updated_at)
       `values` içine ASLA girmez; yalnız registry'deki alanlar.
   =============================================================== */

/** Repository'nin döndürdüğü ham satır (tek varlık, tek dil). */
export type ContentRow = {
  parentId: string;
  locale: Locale;
  values: ContentValues;
  /** slugKind'li varlıklarda çeviri satırının slug'ı; diğerlerinde undefined. */
  slug?: string | null;
};

/** parentId → locale → satır. */
export type ContentRowIndex = Map<string, Partial<Record<Locale, ContentRow>>>;

export function indexContentRows(rows: readonly ContentRow[]): ContentRowIndex {
  const index: ContentRowIndex = new Map();
  for (const row of rows) {
    let byLocale = index.get(row.parentId);
    if (!byLocale) {
      byLocale = {};
      index.set(row.parentId, byLocale);
    }
    byLocale[row.locale] = row;
  }
  return index;
}

/**
 * Faz 3.1 — ana tablo ek yedeklerini (ör. pages.content) ana-tablo-aynası
 * dilinin (TR, karar 1) satırına uygular. Eski `canonicalBody` kuralı:
 * `body` NULL ise `content` (Faz 5: boş metin "" BİLEREK boşaltma
 * sayılır, eski metin geri gelmez). Satır yoksa ve yedek doluysa yalnız o alanı
 * taşıyan sanal bir TR satırı eklenir (eski katman da canonical'i
 * gösterirdi). Hangi dillerin kullanılacağına zincir karar verir: TR
 * pasifse bu değerler de KULLANILMAZ.
 */
export function applyBaseSupplements(
  def: ContentEntityDef,
  rows: readonly ContentRow[],
  supplements: ReadonlyMap<string, ContentValues>
): ContentRow[] {
  if (supplements.size === 0) return [...rows];
  const out = rows.map((r) => ({ ...r, values: { ...r.values } }));
  const mirrorRows = new Map<string, ContentRow>();
  for (const r of out) if (r.locale === BASE_MIRROR_LOCALE) mirrorRows.set(r.parentId, r);
  for (const [parentId, extra] of supplements) {
    const fields = def.fields.filter((f) => f.name in extra && isContentFieldFilled(def, f, extra[f.name]));
    if (fields.length === 0) continue;
    let row = mirrorRows.get(parentId);
    if (!row) {
      const values: ContentValues = {};
      for (const f of def.fields) values[f.name] = null;
      row = { parentId, locale: BASE_MIRROR_LOCALE, values };
      if (def.slugKind) row.slug = null;
      out.push(row);
      mirrorRows.set(parentId, row);
    }
    for (const f of fields) {
      /* Faz 5: YALNIZ NULL (hiç yazılmamış / eski veri) → eski kolon.
         "" (boş metin) = kullanıcı BİLEREK boşalttı → eski metin GERİ
         GELMEZ. Eski `body ?? content` kuralıyla birebir. */
      const cur = row.values[f.name];
      if (cur === null || cur === undefined) row.values[f.name] = extra[f.name];
    }
  }
  return out;
}

/**
 * Tek bir kaydın dil satırlarını zincire göre çözer.
 * `null` → zincirdeki (aktif) dillerin HİÇBİRİNDE satır yok.
 */
export function resolveLocalizedContent(
  def: ContentEntityDef,
  byLocale: Partial<Record<Locale, ContentRow>> | undefined,
  requested: Locale,
  chain: readonly Locale[]
): LocalizedContent | null {
  if (!byLocale) return null;
  const present = chain.filter((l) => byLocale[l] !== undefined);
  if (present.length === 0) return null;

  const values: ContentValues = {};
  const sourceLocale: Record<string, Locale | null> = {};
  const missing: string[] = [];
  const fallbackFields: string[] = [];
  const explicitEmpty: string[] = [];

  for (const field of def.fields) {
    let picked: Locale | null = null;
    let deliberatelyEmpty = false;
    for (const locale of present) {
      const v = byLocale[locale]?.values[field.name];
      if (isContentFieldFilled(def, field, v)) {
        picked = locale;
        values[field.name] = v;
        break;
      }
      /* Faz 5 son kontroller: bilinçli boş gövde ("") zinciri DURDURUR. */
      if (isExplicitEmptyContent(def, field, v)) {
        picked = locale;
        deliberatelyEmpty = true;
        values[field.name] = "";
        break;
      }
    }
    sourceLocale[field.name] = picked;
    if (deliberatelyEmpty) {
      missing.push(field.name);
      explicitEmpty.push(field.name);
    } else if (picked === null) {
      values[field.name] = null;
      missing.push(field.name);
    } else if (picked !== requested) {
      fallbackFields.push(field.name);
    }
  }

  const out: LocalizedContent = {
    values,
    sourceLocale,
    missing,
    fallbackFields,
    /* Karar 5 (noindex): istenen dilde "çeviri var" sayılan alanların
       (content-field-rules.availabilityFields — blog/sayfa: title|body|
       excerpt, eski content-availability ile aynı) HİÇBİRİ istenen
       dilden gelmiyorsa içerik yedek dilde gösteriliyordur. Kısmi yedek
       noindex sebebi değildir → fallbackFields. */
    isFallback: !availabilityFields(def).some((f) => sourceLocale[f] === requested && !explicitEmpty.includes(f)),
    requestedLocale: requested,
  };
  if (explicitEmpty.length) out.explicitEmpty = explicitEmpty;
  if (def.slugKind) {
    const own = chain.includes(requested) ? byLocale[requested]?.slug : undefined;
    out.slug = typeof own === "string" && own.trim() !== "" ? own : null;
  }
  return out;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Kimlik doğrulama + kanonik form. Geçersiz kimlik DB'ye gitmez
 *  (tek bir bozuk id bütün batch sorgusunu 22P02 ile düşürmesin). */
export function canonicalParentId(
  id: unknown,
  type: ContentEntityDef["parentIdType"]
): string | null {
  if (typeof id === "number" && type === "smallint") id = String(id);
  if (typeof id !== "string") return null;
  const s = id.trim();
  if (type === "uuid") return UUID_RE.test(s) ? s.toLowerCase() : null;
  if (!/^\d{1,5}$/.test(s)) return null;
  const n = Number(s);
  return n >= 0 && n <= 32767 ? String(n) : null;
}

/** Girdi kimliklerini tekrarsız kanonik listeye çevirir; çıktıyı
 *  ÇAĞIRANIN verdiği kimlikle anahtarlamak için kanonik → orijinaller. */
export function normalizeParentIds(
  ids: readonly unknown[],
  type: ContentEntityDef["parentIdType"]
): { canonical: string[]; originals: Map<string, string[]> } {
  const originals = new Map<string, string[]>();
  for (const raw of ids) {
    const c = canonicalParentId(raw, type);
    if (c === null) continue;
    const list = originals.get(c);
    const original = String(raw);
    if (!list) originals.set(c, [original]);
    else if (!list.includes(original)) list.push(original);
  }
  return { canonical: [...originals.keys()].sort(), originals };
}

/** Kısa, deterministik 53-bit hash (cyrb53) — uzun kimlik listeleri için
 *  cache anahtarı. Kriptografik değildir; anahtarda kimlik sayısı da var. */
export function hashKey(input: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Cache anahtarı: varlık + istenen dil + ANA DİL + aktif diller + kimlikler.
 *  Ana dil / aktif dil kümesi değişince anahtar da değişir → eski dilin
 *  sonucu yeni ayarla ASLA servis edilmez. */
export function contentCacheKey(parts: {
  op: string;
  entity: string;
  requested?: Locale;
  chain?: readonly Locale[];
  root?: Locale;
  enabled?: readonly Locale[];
  ids?: readonly string[];
}): string {
  const ids = parts.ids ?? [];
  const idPart = ids.length <= 8 ? ids.join(",") : `${ids.length}#${hashKey(ids.join(","))}`;
  return [
    "content:v1",
    parts.op,
    parts.entity,
    `req=${parts.requested ?? "-"}`,
    `chain=${(parts.chain ?? []).join(">")}`,
    `root=${parts.root ?? "-"}`,
    `on=${(parts.enabled ?? []).join(",")}`,
    `ids=${idPart}`,
  ].join("|");
}
