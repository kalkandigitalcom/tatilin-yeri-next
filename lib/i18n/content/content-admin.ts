import type { Locale } from "@/lib/i18n/config";
import { CONTENT_ENTITY_BY_KEY, CONTENT_LOCALES, type ContentEntityKey } from "@/lib/i18n/content/content-registry";
import type { ContentValues } from "@/lib/i18n/content/content-contract";
import { isContentFieldFilled } from "@/lib/i18n/content/content-field-rules";

/* ===============================================================
   🌐 ADMIN İÇERİK DÜZENİ — Faz 5 (SAF; client + server)
   ===============================================================
   Ana form = ana dil (settings.public_default_locale); diğer iki dil
   ayrı çeviri bölümlerinde. Hiçbir dil yapısal olarak ayrıcalıklı
   değildir: düzen YALNIZ ana dile göre kurulur. Ana dil değişince
   içerik taşınmaz, yalnız düzen değişir.
   =============================================================== */

export type AdminContentLocales = Partial<Record<Locale, ContentValues & { slug?: string | null }>>;

export type AdminLocaleLayout = {
  root: Locale;
  /** Ana dil dışındaki diller (aktif önce, sonra pasif; sabit sıra). */
  translations: Locale[];
  enabled: Locale[];
  multilingual: boolean;
};

export const ADMIN_LOCALE_LABELS: Record<Locale, string> = {
  tr: "Türkçe",
  en: "English",
  de: "Deutsch",
};

export const ADMIN_LOCALE_SHORT: Record<Locale, string> = { tr: "TR", en: "EN", de: "DE" };

export function adminLocaleLayout(root: Locale, enabled: readonly Locale[], multilingual: boolean): AdminLocaleLayout {
  const others = CONTENT_LOCALES.filter((l) => l !== root);
  /* Bugünkü kullanıcı deneyimiyle uyum: ana dil TR iken sıra EN, DE. */
  const translations = [...others.filter((l) => enabled.includes(l)), ...others.filter((l) => !enabled.includes(l))];
  return { root, translations, enabled: [...enabled], multilingual };
}

/** Bir dilin eksik (boş) alanları — "eksik çeviri" göstergesi. */
export function missingFieldsOf(
  entity: ContentEntityKey,
  values: (ContentValues & { slug?: string | null }) | undefined | null
): string[] {
  const def = CONTENT_ENTITY_BY_KEY[entity];
  return def.fields.filter((f) => !isContentFieldFilled(def, f, values?.[f.name])).map((f) => f.name);
}

/** Admin girdisi (form metni) → yazma patch'i: metin alanında boş/boşluk
 *  "" olarak gönderilir (BİLEREK boşaltma; content-contract). */
export function textPatch(fields: Record<string, string | null | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    out[k] = typeof v === "string" ? v : "";
  }
  return out;
}
