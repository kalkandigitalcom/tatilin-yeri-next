import "server-only";

import type { AuthorizedAdminCaller } from "@/lib/admin-route-auth";
import { isRealArrayColumn } from "@/lib/db/pg-array-columns";
import { CONTENT_ENTITY_BY_KEY } from "@/lib/i18n/content/content-registry";
import {
  adminSaveContentMany,
  getAdminContent,
  getAdminLocaleLayout,
  type ContentTechnicalPatch,
} from "@/lib/i18n/content/content-admin.server";

import type { Locale } from "@/lib/i18n/config";
import { settingsServerRepository } from "@/lib/db/settings.repository.server";
import {
  SETTINGS_TRANSLATABLE_FIELDS,
  SETTINGS_TRANSLATION_MAX_LEN,
  type SettingsTranslatableField,
} from "@/lib/i18n/settings-translations.types";
import { saveTranslationRow } from "@/app/(admin)/maki-admin/_content/simple-content.server";

/* ===============================================================
   🌐 GENEL AYARLAR — Faz 5 dalga 2 merkezi yazma/okuma yardımcıları
   ===============================================================
   Çevrilebilir alanlar YALNIZ registry'deki 9 alandır (footer_copyright,
   default_meta_title, default_meta_description, hero_title, hero_subtitle,
   hero_badge_text, hero_primary_cta_text, hero_secondary_cta_text,
   business_hours). site_name, telefon, e-posta, adres, logo, favicon,
   sosyal medya, script'ler, bakım mesajı (084: çeviri kaldırıldı),
   public_default_locale vb. DİLDEN BAĞIMSIZDIR → ana tabloda kalır
   (teknik yama). Ana dili değiştirmek içerik taşımaz: yalnız hangi dilin
   ana formda düzenlendiğini değiştirir.

   PUT akışı:
     • çevrilebilir alanlar → ana dilin (`public_default_locale`) içeriği
       (saveContentMany öğesi),
     • diğer kolonlar → aynı transaction'da teknik UPDATE.
   Ana dil TR iken TR içerik yazımı ana tabloya gider (mirror) → eski
   davranışla birebir. Yetki kontrolü ÇAĞIRAN route'ta yapılır.
   =============================================================== */

export const SETTINGS_CONTENT_FIELDS: readonly string[] =
  CONTENT_ENTITY_BY_KEY.settings.fields.map((f) => f.name);

const CONTENT_SET = new Set(SETTINGS_CONTENT_FIELDS);

export function splitSettingsValues(values: Record<string, unknown>): {
  content: Record<string, unknown>;
  technical: Record<string, unknown>;
} {
  const content: Record<string, unknown> = {};
  const technical: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined) continue;
    if (k === "id") continue; // tekil satır kimliği yazılmaz (eski PUT'ta da anlamsızdı)
    if (CONTENT_SET.has(k)) content[k] = typeof v === "string" ? v : v === null ? null : String(v);
    else technical[k] = v;
  }
  return { content, technical };
}

/** jsonb kolonlar: eski query-compiler ile aynı kural (plain obje veya
 *  gerçek array kolonu olmayan dizi → `::jsonb`). */
function jsonColumnsOf(values: Record<string, unknown>): string[] {
  return Object.entries(values)
    .filter(([k, v]) => {
      if (v === null || typeof v !== "object" || v instanceof Date) return false;
      if (Array.isArray(v)) return !isRealArrayColumn("settings", k);
      return Object.getPrototypeOf(v) === Object.prototype;
    })
    .map(([k]) => k);
}

/** GET: çevrilebilir alanlar ana dilin değeriyle değiştirilir (ana form
 *  ana dili düzenler). Ana dil TR iken değerler ana tablodakiyle aynıdır. */
export async function overlaySettingsRootContent<T extends Record<string, unknown>>(row: T): Promise<T> {
  const id = String(row.id ?? "");
  if (!id) return row;
  const layout = await getAdminLocaleLayout();
  if (layout.root === "tr") return row;
  const byLocale = await getAdminContent("settings", id);
  const root = byLocale[layout.root] ?? {};
  const out: Record<string, unknown> = { ...row };
  for (const f of SETTINGS_CONTENT_FIELDS) out[f] = (root[f] as unknown) ?? null;
  return out as T;
}

export type SettingsSaveResult = { ok: true } | { ok: false; error: string; code?: string };

export async function saveSettingsCentral(
  caller: AuthorizedAdminCaller,
  id: string,
  values: Record<string, unknown>
): Promise<SettingsSaveResult> {
  const { content, technical } = splitSettingsValues(values);
  const layout = await getAdminLocaleLayout();
  const items = Object.keys(content).length
    ? [{ entity: "settings" as const, parentId: id, locale: layout.root, patch: content }]
    : [];
  const tech: ContentTechnicalPatch[] = Object.keys(technical).length
    ? [{ entity: "settings", parentId: id, values: technical, jsonColumns: jsonColumnsOf(technical) }]
    : [];
  if (items.length === 0 && tech.length === 0) return { ok: true };
  const r = await adminSaveContentMany(caller, {
    items,
    technical: tech,
    action: "settings.update",
    entity: "settings",
    entityId: id,
    title: "Genel ayarlar",
    route: "/maki-admin/settings",
  });
  if (!r.ok) return { ok: false, error: r.error, code: (r as { code?: string }).code };
  return { ok: true };
}

/* ---------------------------------------------------------------
   ÇEVİRİLER EKRANI — ana dil salt okunur, diğer iki dil düzenlenir
--------------------------------------------------------------- */

export type SettingsTextValues = Record<SettingsTranslatableField, string | null>;

export type SettingsTranslationsCentral = {
  rootLocale: Locale;
  translationLocales: Locale[];
  multilingual: boolean;
  /** Ana dilin değerleri (ilgili ayar sayfasından düzenlenir). */
  root: SettingsTextValues;
  /** Ana dil DIŞINDAKİ dillerin kayıtlı değerleri (satır yoksa yok). */
  translations: Partial<Record<Locale, SettingsTextValues>>;
};

function pick(src: Record<string, unknown> | undefined): SettingsTextValues {
  const out = {} as SettingsTextValues;
  for (const f of SETTINGS_TRANSLATABLE_FIELDS) {
    const v = src?.[f];
    out[f] = typeof v === "string" ? v : null;
  }
  return out;
}

async function resolveSettingsId(): Promise<string | null> {
  const { data, error } = await settingsServerRepository.findSingletonId();
  if (error) return null;
  const id = (data as { id?: unknown } | null)?.id;
  return typeof id === "string" && id.trim() ? id : null;
}

export async function loadSettingsTranslationsCentral(
  fallbackRoot?: Record<string, unknown> | null
): Promise<{ ok: true; data: SettingsTranslationsCentral } | { ok: false; error: string }> {
  try {
    const id = await resolveSettingsId();
    if (!id) return { ok: false, error: "Ayar kaydı bulunamadı" };
    const layout = await getAdminLocaleLayout();
    const byLocale = await getAdminContent("settings", id);
    /* Ana dil TR iken TR satırı (106 mirror) yoksa ana tablo değerleri. */
    const rootSrc =
      byLocale[layout.root] ?? (layout.root === "tr" ? fallbackRoot ?? undefined : undefined);
    const translations: Partial<Record<Locale, SettingsTextValues>> = {};
    for (const l of layout.translations) if (byLocale[l]) translations[l] = pick(byLocale[l]);
    return {
      ok: true,
      data: {
        rootLocale: layout.root,
        translationLocales: [...layout.translations],
        multilingual: layout.multilingual,
        root: pick(rootSrc as Record<string, unknown> | undefined),
        translations,
      },
    };
  } catch {
    return { ok: false, error: "Çeviriler okunamadı" };
  }
}

const FIELD_LABELS: Record<SettingsTranslatableField, string> = {
  footer_copyright: "Footer telif metni",
  default_meta_title: "Varsayılan meta başlık",
  default_meta_description: "Varsayılan meta açıklama",
  hero_title: "Hero başlığı",
  hero_subtitle: "Hero alt başlık",
  hero_badge_text: "Hero rozet metni",
  hero_primary_cta_text: "Birincil buton metni",
  hero_secondary_cta_text: "İkincil buton metni",
  business_hours: "Çalışma saatleri",
};

/** Eski servisle aynı normalizasyon: alan whitelist'i (spread YOK),
 *  trim + boş → null, uzunluk limitleri. */
export function normalizeSettingsTranslation(
  input: Record<string, unknown>
): { ok: true; values: SettingsTextValues } | { ok: false; error: string } {
  const values = {} as SettingsTextValues;
  for (const f of SETTINGS_TRANSLATABLE_FIELDS) {
    const raw = input?.[f];
    const t = (typeof raw === "string" ? raw : raw == null ? "" : String(raw)).trim();
    values[f] = t.length ? t : null;
    const max = SETTINGS_TRANSLATION_MAX_LEN[f];
    if (values[f] && values[f]!.length > max) {
      return { ok: false, error: `${FIELD_LABELS[f]} ${max} karakteri geçemez` };
    }
  }
  return { ok: true, values };
}

export async function saveSettingsTranslationCentral(
  caller: AuthorizedAdminCaller,
  input: { locale: unknown } & Record<string, unknown>
): Promise<{ ok: true; locale: Locale; values: SettingsTextValues } | { ok: false; error: string }> {
  const norm = normalizeSettingsTranslation(input);
  if (!norm.ok) return norm;
  const id = await resolveSettingsId();
  if (!id) return { ok: false, error: "Ayar kaydı bulunamadı" };
  const r = await saveTranslationRow(caller, "settings", id, input.locale, norm.values, {
    title: "Genel ayarlar",
    route: "/maki-admin/settings/ceviriler",
  });
  if (!r.ok) return r;
  return { ok: true, locale: input.locale as Locale, values: pick(r.row) };
}

/** "Çeviriyi kaldır": o dilin 9 alanı temizlenir (NULL) → public tarafta
 *  Faz 3.1 fallback sırası uygulanır. Ana dil kaldırılamaz. */
export async function clearSettingsTranslationCentral(
  caller: AuthorizedAdminCaller,
  locale: unknown
): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = await resolveSettingsId();
  if (!id) return { ok: false, error: "Ayar kaydı bulunamadı" };
  const empty = {} as SettingsTextValues;
  for (const f of SETTINGS_TRANSLATABLE_FIELDS) empty[f] = null;
  const r = await saveTranslationRow(caller, "settings", id, locale, empty, {
    title: "Genel ayarlar",
    route: "/maki-admin/settings/ceviriler",
  });
  return r.ok ? { ok: true } : r;
}
