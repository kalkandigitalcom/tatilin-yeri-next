import "server-only";

import { unstable_cache } from "next/cache";

import { getPgPool } from "@/lib/db/pg.client";
import { CONTENT_CACHE_REVALIDATE_SECONDS } from "@/lib/i18n/content/content-cache-policy";
import type { ContentEntityKey } from "@/lib/i18n/content/content-registry";
import { contentLocaleContextFromSettings } from "@/lib/i18n/content/content-locale-context";
import { createContentRepository } from "@/lib/i18n/content/content-repository";
import { createContentReadService } from "@/lib/i18n/content/content-read-core";
import type { PublicContentReader } from "@/lib/i18n/content/public-villa-content";

/* ===============================================================
   🌐 SITEMAP İÇİN MERKEZİ OKUYUCU — Faz 6 Dalga 5 (server-only)
   ===============================================================
   Aynı merkezi çekirdek + depo (content-read.server ile aynı SQL ve
   çözümleyici). Fark: okuma HATASI görünür kılınır (`failed`). Merkezi
   servis hatada boş sonuç döndürdüğü için, sitemap bir okuma hatasını
   "içerik yok" sanıp bütün villaları / yazıları listeden atmasın diye
   çağıran hata durumunda eski (Dalga 5 öncesi) bozulma davranışına
   geçer. Dil bağlamı çağıranın ZATEN okuduğu ayardan (ek okuma yok).
   🌐 Faz 6 Dalga 6 — okumalar kalıcı cache'ten ve içerik tag'leriyle
   (content, content:<varlık>, settings, eski tag'ler) yapılır: böylece
   sitemap.xml'in ISR girdisi bu tag'leri taşır ve admin'de içerik /
   çeviri kaydı (merkezi yazma → content:<varlık>) sitemap'i de HEMEN
   geçersiz kılar (önceden saatlik ISR dolana kadar eski dil listesi).
   Hata cache'lenmez (fonksiyon throw eder → `failed`).
   =============================================================== */

export type SitemapContentReader = {
  reader: PublicContentReader;
  /** Okuma hatası alan varlıklar. */
  failed: Set<ContentEntityKey>;
};

export function createSitemapContentReader(
  settings: Parameters<typeof contentLocaleContextFromSettings>[0]
): SitemapContentReader {
  const failed = new Set<ContentEntityKey>();
  const ctx = contentLocaleContextFromSettings(settings);
  const svc = createContentReadService({
    repository: createContentRepository((q) => getPgPool().query(q.text, q.values)),
    getLocaleContext: () => ctx,
    cache: (key, tags, fn) =>
      unstable_cache(fn, ["sitemap-content", key], { tags, revalidate: CONTENT_CACHE_REVALIDATE_SECONDS })(),
    onError: (err, where) => {
      const entity = where.split(":")[1] as ContentEntityKey | undefined;
      if (entity) failed.add(entity);
      console.error(`[sitemap] content-read ${where}`, err instanceof Error ? err.message : err);
    },
  });
  return {
    reader: { getContent: svc.getContent, getContentMany: svc.getContentMany },
    failed,
  };
}
