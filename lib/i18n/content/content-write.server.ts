import "server-only";

import { revalidateTag } from "next/cache";

import { getPgPool } from "@/lib/db/pg.client";
import { revalidateLocaleSlugs } from "@/lib/i18n/routing/slug-map.server";
import { contentWriteInvalidationTags } from "@/lib/i18n/content/content-cache-policy";
import type { ContentEntityKey } from "@/lib/i18n/content/content-registry";
import { isContentWriteMigrated } from "@/lib/i18n/content/content-write-modules";
import {
  createContentWriteService,
  type TransactionRunner,
} from "@/lib/i18n/content/content-write-core";

/* ===============================================================
   🌐 MERKEZİ SİMETRİK İÇERİK YAZMA — SUNUCU BAĞLANTISI (Faz 4)
   ===============================================================
   Faz 5: yalnız admin içerik eylemi (app/(admin)/maki-admin/_content/
   content-locale.action.ts) import eder.

   ÇİFT YAZMA YOLU KORUMASI (Faz 5): servis YALNIZ content-write-modules
   listesindeki varlıklar için etkindir; o varlıkların eski yazma yolları
   aynı listeyle kapatılır. Eski ve yeni yol aynı anda ETKİN OLMAZ.

   Commit SONRASI: içerik cache tag'leri (content, content:<varlık>,
   settings + eski tag'ler) ve slug değiştiyse locale-slugs geçersiz
   kılınır. Commit öncesi revalidate YAPILMAZ (geri alınan yazma cache'i
   boşaltmasın).
   =============================================================== */

const transaction: TransactionRunner = async (fn) => {
  const client = await getPgPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn((text, values) => client.query(text, values as unknown[]));
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* bağlantı koptuysa pg zaten geri alır */
    }
    throw err;
  } finally {
    client.release();
  }
};

const service = createContentWriteService({
  transaction,
  /* Faz 5: modül bazında (content-write-modules.ts). Eski yol aynı
     varlık için kapalıdır; iki yol aynı anda çalışmaz. */
  enabled: (entity) => isContentWriteMigrated(entity),
  onCommitted: ({ entities, slugChanged }) => {
    /* "settings" tag'i yalnız settings içeriği yazıldığında düşürülür
       (diğer varlıklarda routing/ayar cache'lerini gereksiz boşaltmasın). */
    /* 🌐 Faz 6 Dalga 6 — tag kümesi saf politikadan (testle eşleşme kilidi). */
    for (const tag of contentWriteInvalidationTags(entities)) {
      try {
        revalidateTag(tag, { expire: 0 });
      } catch {
        /* noop */
      }
    }
    if (slugChanged) {
      try {
        revalidateLocaleSlugs();
      } catch {
        /* noop */
      }
    }
  },
  onError: (err, where) => console.error(`[content-write] ${where}`, err),
});

/** 🌐 Faz 6 Dalga 6 — merkezi yazmadan GEÇMEYEN kayıt silmeleri (blog /
 *  CMS sayfası DELETE route'ları) için aynı tag kümesi: silinen kaydı
 *  okuyan sayfalar, header/footer ve sitemap.xml hemen yenilenir
 *  (önceden sitemap ≤1 sa silinmiş URL'yi listeleyebiliyordu). */
export function invalidateContentEntity(entity: ContentEntityKey): void {
  for (const tag of contentWriteInvalidationTags([entity])) {
    try {
      revalidateTag(tag, { expire: 0 });
    } catch {
      /* noop */
    }
  }
}

export const saveContent = service.saveContent;
export const saveContentMany = service.saveContentMany;
export const createContent = service.createContent;
export const getContentWriteConfig = service.getContentWriteConfig;
export { validateContentPayload } from "@/lib/i18n/content/content-write-validate";
