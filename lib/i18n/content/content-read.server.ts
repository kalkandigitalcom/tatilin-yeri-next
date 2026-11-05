import "server-only";

import { cache } from "react";
import { unstable_cache } from "next/cache";

import { getPgPool } from "@/lib/db/pg.client";
import { getCachedSettings } from "@/lib/cache.helpers";
import type { Locale } from "@/lib/i18n/config";
import type { ContentEntityKey } from "@/lib/i18n/content/content-registry";
import type { ContentReadOptions } from "@/lib/i18n/content/content-contract";
import { CONTENT_CACHE_REVALIDATE_SECONDS } from "@/lib/i18n/content/content-cache-policy";
import { contentLocaleContextFromSettings } from "@/lib/i18n/content/content-locale-context";
import { createContentRepository } from "@/lib/i18n/content/content-repository";
import {
  createContentReadService,
  type ContentCacheAdapter,
} from "@/lib/i18n/content/content-read-core";

/* ===============================================================
   🌐 MERKEZİ SİMETRİK İÇERİK OKUMA — SUNUCU BAĞLANTISI (Faz 3)
   ===============================================================
   ⚠️ FAZ 3 SINIRI: Bu dosyayı henüz HİÇBİR public sayfa / admin ekranı
   / servis import etmez. Mevcut okuma yolları (lib/i18n/get-*.server.ts)
   DEĞİŞMEDİ; bu servis paralel hazırdır (Faz 4+ geçiş).

   • DB: native pg (getPgPool) — yalnız SELECT.
   • Dil bağlamı: getCachedSettings() → getRootLocale / getEnabledPublicLocales.
   • Kalıcı cache: unstable_cache; anahtar = varlık + istenen dil + zincir
     + ana dil + aktif diller + kimlikler; tag'ler content-cache-policy.
   • İstek içi tekilleştirme: React cache() (aynı render'da aynı argümanlar
     tek okuma). Kimlik listesi JSON anahtarına çevrilir (dizi referansı
     eşitliği sorunu yok).
   =============================================================== */

const persistentCache: ContentCacheAdapter = (key, tags, fn) =>
  unstable_cache(fn, [key], { tags, revalidate: CONTENT_CACHE_REVALIDATE_SECONDS })();

const service = createContentReadService({
  repository: createContentRepository((q) => getPgPool().query(q.text, q.values)),
  getLocaleContext: async () => contentLocaleContextFromSettings(await getCachedSettings()),
  cache: persistentCache,
  onError: (err, where) => console.error(`[content-read] ${where}`, err),
});

const getContentManyCached = cache(
  (entity: ContentEntityKey, idsKey: string, locale: Locale, fallbackKey: string) =>
    service.getContentMany(
      entity,
      JSON.parse(idsKey) as string[],
      locale,
      fallbackKey ? { fallback: JSON.parse(fallbackKey) as Locale[] } : undefined
    )
);

export async function getContentMany(
  entity: ContentEntityKey,
  parentIds: readonly string[],
  locale: Locale,
  opts?: ContentReadOptions
) {
  const fb = opts?.fallback?.length ? JSON.stringify(opts.fallback) : "";
  /* Paylaşılan Map'in çağıran tarafından değiştirilmesine karşı kopya. */
  return new Map(await getContentManyCached(entity, JSON.stringify(parentIds), locale, fb));
}

export async function getContent(
  entity: ContentEntityKey,
  parentId: string,
  locale: Locale,
  opts?: ContentReadOptions
) {
  return (await getContentMany(entity, [parentId], locale, opts)).get(String(parentId)) ?? null;
}

export const getCoverage = (entity: ContentEntityKey, locale: Locale) =>
  service.getCoverage(entity, locale);

export const getCoverageReport = (locales?: readonly Locale[]) =>
  service.getCoverageReport(locales);

export const getAllLocales = (entity: ContentEntityKey, parentId: string) =>
  service.getAllLocales(entity, parentId);

export const findContentIdBySlug = cache(
  (entity: ContentEntityKey, slug: string, locale: Locale) =>
    service.findIdBySlug(entity, slug, locale)
);

/** Faz 6 Dalga 1 — teknik anahtar → kimlik (istek içi tekilleştirilmiş). */
export const findContentIdByTechnicalKey = cache(
  (entity: ContentEntityKey, technicalKey: string) => service.findIdByTechnicalKey(entity, technicalKey)
);
