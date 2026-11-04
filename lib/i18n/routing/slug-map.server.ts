import "server-only";

import { revalidateTag, unstable_cache } from "next/cache";

import { getPgPool } from "@/lib/db/pg.client";
import type { LocalizedSlugMap, RedirectMap } from "@/lib/i18n/routing/context";
import {
  LOCALIZED_SLUGS_SQL,
  REDIRECTS_SQL,
  rowsToRedirectMap,
  rowsToSlugMap,
} from "@/lib/i18n/routing/sql";

/* ===============================================================
   🌐 DİL BAZLI SLUG HARİTASI — migration 102 (server-only, cache'li)
   ===============================================================
   Taban (TR) slug → dil → SEO slug. Yalnız slug'ı DOLU çeviri
   satırları okunur (haritada yalnız gerçekten çevrilmiş kayıtlar).
   Cache tag: "locale-slugs" (çeviri kaydı/silme invalidate eder) +
   1 saatlik revalidate. Migration 102 uygulanmamışsa / okuma hatası →
   boş harita (tüm diller TR slug'ı ile; bugünkü davranış).
   =============================================================== */

export const LOCALE_SLUGS_TAG = "locale-slugs";

/* SQL ve satır→harita dönüşümü proxy ile ORTAK: lib/i18n/routing/sql.ts */
export { rowsToSlugMap } from "@/lib/i18n/routing/sql";

export async function loadLocalizedSlugMap(): Promise<LocalizedSlugMap> {
  try {
    const res = await getPgPool().query(LOCALIZED_SLUGS_SQL);
    return rowsToSlugMap(res.rows ?? []);
  } catch (err) {
    console.error(
      "[locale-slugs] okunamadı (migration 102?) — boş harita",
      err instanceof Error ? err.message : err
    );
    return {};
  }
}

export const getCachedLocalizedSlugMap = unstable_cache(
  loadLocalizedSlugMap,
  ["locale-slugs:v1"],
  { tags: [LOCALE_SLUGS_TAG], revalidate: 3600 }
);

/** Dil slug'ı kaydedildikten sonra haritayı ve ona bağlı sayfaları
 *  yeniler. Next bağlamı dışında (test) sessizce yok sayılır. */
export function revalidateLocaleSlugs(): void {
  try {
    revalidateTag(LOCALE_SLUGS_TAG, { expire: 0 });
  } catch {
    /* noop */
  }
}

/** Slug geçmişi (migration 103). Hata / tablo yok → boş (yönlendirme yok). */
export async function loadRedirectMap(): Promise<RedirectMap> {
  try {
    const res = await getPgPool().query(REDIRECTS_SQL);
    return rowsToRedirectMap(res.rows ?? []);
  } catch (err) {
    console.error(
      "[url-redirects] okunamadı (migration 103?) — boş harita",
      err instanceof Error ? err.message : err
    );
    return {};
  }
}

export const getCachedRedirectMap = unstable_cache(loadRedirectMap, ["url-redirects:v1"], {
  tags: [LOCALE_SLUGS_TAG],
  revalidate: 3600,
});
