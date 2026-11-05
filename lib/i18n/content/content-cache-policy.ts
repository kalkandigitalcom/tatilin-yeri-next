import type { ContentEntityKey } from "@/lib/i18n/content/content-registry";
import { CONTENT_ENTITIES } from "@/lib/i18n/content/content-registry";
import { isContentWriteMigrated } from "@/lib/i18n/content/content-write-modules";

/* ===============================================================
   🌐 MERKEZİ İÇERİK OKUMA — CACHE POLİTİKASI (Seçenek D, Faz 3, SAF)
   ===============================================================
   Mevcut cache sistemiyle uyum:
     • Her sonuç "content", "content:<varlık>" ve "settings" tag'lerini
       taşır. Ana dil / aktif dil değişimi invalidatePublicRoutingCaches()
       ile "settings"i düşürür → bu cache de düşer (anahtarda ayrıca
       root + aktif diller var: eski dilin sonucu yeni ayarla eşleşmez).
     • Bugünkü (eski) yazma yollarının ZATEN revalidate ettiği tag'ler
       (villas, taxonomy, menu, faqs, homepage, discount, site-popup,
       locale-slugs) eklenir → eski admin kaydı da bu cache'i düşürür.
     • Eski yazma yolunda tag'i OLMAYAN varlıklar (blog, sayfa, kural,
       fiyata dahil, özellik, ödeme yöntemi) KALICI cache'e ALINMAZ;
       yalnız istek-içi (React cache) tekilleştirme yapılır. Faz 4'te
       yazma merkezi servise geçince "content:<varlık>" ile açılabilir.
   Değerler sabit literal: kaynak sabitlerle eşitliği testte doğrulanır
   (LOCALE_SLUGS_TAG, SITE_POPUP_CACHE_TAG).
   =============================================================== */

export const CONTENT_CACHE_TAG = "content";
export const CONTENT_CACHE_REVALIDATE_SECONDS = 600;

/** Eski yazma yollarının revalidate ettiği tag'ler (varlık bazında). */
export const CONTENT_LEGACY_TAGS: Readonly<Record<ContentEntityKey, readonly string[]>> = {
  villa: ["villas", "locale-slugs"],
  villa_type: ["taxonomy", "locale-slugs"],
  villa_feature: [],
  rule_item: [],
  price_include_item: [],
  blog_post: [],
  page: [],
  faq: ["faqs"],
  menu: ["menu"],
  payment_method: [],
  settings: ["settings"],
  site_popup: ["site-popup"],
  homepage_collection: ["homepage"],
  discount_collection: ["discount"],
};

/** Kalıcı (istekler arası) cache'e alınabilir mi?
 *
 *  🌐 Faz 6 Dalga 6 — KÖK NEDEN DÜZELTMESİ: Faz 3'te "eski yazma yolunda
 *  tag'i olmayan" varlıklar (blog, sayfa, özellik, kural, fiyata dahil,
 *  ödeme yöntemi) kalıcı cache'e alınmıyordu. Bunun yan etkisi: bu
 *  okumalar HİÇ cache tag'i taşımadığı için, onları kullanan statik/ISR
 *  sayfalar (blog dizini, header/footer'daki CMS sayfa başlıkları — ana
 *  sayfa, iletişim, teklif vb.) merkezi yazmanın düşürdüğü
 *  `content:<varlık>` tag'ine BAĞLANMIYOR, kaydedilen çeviri sayfanın
 *  ISR süresi (≤1 sa) dolana kadar görünmüyordu. Faz 5'ten beri bu
 *  varlıkların TEK yazma yolu merkezi servis (onCommitted →
 *  `content:<varlık>` revalidate) → artık güvenle kalıcı cache'lenir ve
 *  okuyan sayfa tag'i taşır. Modül merkezi yazmadan geri alınırsa
 *  (content-write-modules) eski kural geri gelir. */
export function isPersistentlyCacheable(entity: ContentEntityKey): boolean {
  return CONTENT_LEGACY_TAGS[entity].length > 0 || isContentWriteMigrated(entity);
}

/** Merkezi yazma sonrası düşürülecek tag'ler (content-write.server
 *  onCommitted). Okuma tag'lerinin (`contentCacheTags`) alt kümesi:
 *  "settings" yalnız settings yazıldığında (diğer varlıklarda routing /
 *  ayar cache'lerini gereksiz boşaltmasın). Her varlık için
 *  `content:<varlık>` DAİMA içerilir → okuma ↔ yazma eşleşmesi garanti. */
export function contentWriteInvalidationTags(entities: readonly ContentEntityKey[]): string[] {
  return [
    ...new Set(entities.flatMap((e) => contentCacheTags(e).filter((t) => t !== "settings" || e === "settings"))),
  ];
}

export function contentCacheTags(entity: ContentEntityKey): string[] {
  return [
    ...new Set([
      CONTENT_CACHE_TAG,
      `${CONTENT_CACHE_TAG}:${entity}`,
      "settings",
      ...CONTENT_LEGACY_TAGS[entity],
    ]),
  ];
}

/** Bütün varlıklar politika tablosunda mı (registry ile senkron)? */
export const CONTENT_CACHE_POLICY_COVERS_ALL = CONTENT_ENTITIES.every((e) =>
  Object.prototype.hasOwnProperty.call(CONTENT_LEGACY_TAGS, e.key)
);
