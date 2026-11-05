import "server-only";

import { cache } from "react";
import { unstable_cache } from "next/cache";

import { getCachedFaqs, getCachedSettings } from "@/lib/cache.helpers";
import type { Faq } from "@/app/services/faq.service";
import type { Locale } from "@/lib/i18n/config";
import { getAllLocales } from "@/lib/i18n/content/content-read.server";
import { CONTENT_CACHE_REVALIDATE_SECONDS, contentCacheTags } from "@/lib/i18n/content/content-cache-policy";
import { contentLocaleContextFromSettings } from "@/lib/i18n/content/content-locale-context";
import { CONTENT_ENTITY_BY_KEY } from "@/lib/i18n/content/content-registry";
import { publicContentReader } from "@/lib/i18n/content/public-villa-content.server";
import {
  localizeFaqs,
  publicLocaleCtxFromSettings,
  resolveSingletonByLocale,
  withBaseTrRow,
  resolveSingletonFields,
  type LocaleCtx,
  type SingletonRows,
} from "@/lib/i18n/content/public-shared-content";

/* 🌐 Faz 6 Dalga 4 — tekil kayıtların (settings, site_popup) dil satırları
   merkezi servisin `getAllLocales` okumasından; kalıcı cache varlığın
   tag'leriyle (content-cache-policy) → admin yazımı cache'i düşürür.
   Hata → boş satırlar (sayfa çökmez; çağıran sözlük varsayılanına düşer). */
const rowsCached = unstable_cache(
  async (entity: "settings" | "site_popup", id: string): Promise<SingletonRows> =>
    (await getAllLocales(entity, id)) as SingletonRows,
  ["public-singleton-rows:v1"],
  { tags: [...contentCacheTags("settings"), ...contentCacheTags("site_popup")], revalidate: CONTENT_CACHE_REVALIDATE_SECONDS }
);

export const getSingletonRows = cache(async (entity: "settings" | "site_popup", id: string | number | null | undefined) => {
  const key = id === null || id === undefined ? "" : String(id).trim();
  if (!key) return {} as SingletonRows;
  return rowsCached(entity, key).catch(() => ({}) as SingletonRows);
});

export const getPublicLocaleCtx = cache(async (): Promise<LocaleCtx> =>
  contentLocaleContextFromSettings(await getCachedSettings().catch(() => null))
);

export type SettingsTexts = Record<string, string | null>;

function asTexts(values: Record<string, unknown>): SettingsTexts {
  const out: SettingsTexts = {};
  for (const [k, v] of Object.entries(values)) out[k] = typeof v === "string" ? v : null;
  return out;
}

type SettingsArg = Awaited<ReturnType<typeof getCachedSettings>> | null;

/** `settings` verilirse (çağıran zaten okuduysa) ayar YENİDEN okunmaz. */
async function settingsRows(given?: SettingsArg): Promise<{ rows: SingletonRows; ctx: LocaleCtx }> {
  const settings = given !== undefined ? given : await getCachedSettings().catch(() => null);
  const ctx = given !== undefined ? publicLocaleCtxFromSettings(given) : await getPublicLocaleCtx();
  const raw = await getSingletonRows("settings", (settings as { id?: string } | null)?.id);
  const rows = withBaseTrRow(
    raw,
    settings as unknown as Record<string, unknown> | null,
    CONTENT_ENTITY_BY_KEY.settings.fields,
    ctx
  );
  return { rows, ctx };
}

/** Ayarların 9 çevrilebilir metni, istenen dil için (tekil kayıt kuralı). */
export async function getPublicSettingsTexts(
  locale: Locale,
  opts: { otherActiveFallback?: boolean } = {}
): Promise<SettingsTexts> {
  const { rows, ctx } = await settingsRows();
  return asTexts(resolveSingletonFields(CONTENT_ENTITY_BY_KEY.settings, rows, locale, ctx, opts));
}

/** Aynı metinler BÜTÜN aktif diller için (istemci bileşenleri dil seçer). */
export async function getPublicSettingsTextsByLocale(
  settings?: SettingsArg
): Promise<Partial<Record<Locale, SettingsTexts>>> {
  const { rows, ctx } = await settingsRows(settings);
  const by = resolveSingletonByLocale(CONTENT_ENTITY_BY_KEY.settings, rows, ctx);
  const out: Partial<Record<Locale, SettingsTexts>> = {};
  for (const [l, v] of Object.entries(by)) out[l as Locale] = asTexts(v ?? {});
  return out;
}

/** 🌐 Faz 6 Dalga 4 — ana sayfa SSS: ana tablo listesi (sıra, aktiflik;
 *  cache tag "faqs") + metinler merkezi servisten. Okuma hatası → boş
 *  liste (bölüm ve FAQPage JSON-LD render edilmez; sayfa çökmez). */
export async function getPublicFaqs(locale: Locale): Promise<Faq[]> {
  const base = await getCachedFaqs("tr").catch(() => [] as Faq[]);
  return localizeFaqs(publicContentReader, base, locale).catch(() => [] as Faq[]);
}
