import type { ContentEntityKey } from "@/lib/i18n/content/content-registry";

/* ===============================================================
   🌐 MERKEZİ YAZMAYA GEÇMİŞ MODÜLLER — Faz 5 (SAF, tek doğruluk kaynağı)
   ===============================================================
   Bir varlık bu listeye girdiği anda:
     • merkezi yazma servisi o varlık için ETKİN olur;
     • eski çeviri yazma servisi (app/services/*-translation.service.ts)
       o varlık için yazmayı REDDEDER;
     • eski ana form / eylem o varlığın İÇERİK kolonlarını yazmaz.
   Aynı modül için iki yazma yolu aynı anda çalışmaz. Geri dönüş: varlığı
   listeden çıkarmak + eski formu geri açmak (kod geri alma).

   Faz 5 — 1. dalga (9 basit modül). 2. dalga (villa, blog_post, page,
   settings, site_popup) ayrı adımda eklenecek.
   =============================================================== */

export const CONTENT_WRITE_MIGRATED: ReadonlySet<ContentEntityKey> = new Set<ContentEntityKey>([
  "villa_type",
  "villa_feature",
  "rule_item",
  "price_include_item",
  "faq",
  "menu",
  "payment_method",
  "homepage_collection",
  "discount_collection",
  /* Faz 5 — 2. dalga */
  "site_popup",
  "settings",
  "blog_post",
  "page",
  "villa",
]);

export function isContentWriteMigrated(entity: ContentEntityKey): boolean {
  return CONTENT_WRITE_MIGRATED.has(entity);
}

export const LEGACY_WRITE_DISABLED_MESSAGE =
  "Bu içerik artık merkezi çok dilli içerik editöründen düzenleniyor (eski yazma yolu kapalı).";
