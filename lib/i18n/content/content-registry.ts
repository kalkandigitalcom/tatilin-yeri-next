import type { Locale } from "@/lib/i18n/config";
import type { SlugKind } from "@/lib/i18n/routing/route-registry";

/* ===============================================================
   🌐 SİMETRİK İÇERİK KAYDI — Seçenek D, Faz 1 (SAF, yan etkisiz)
   ===============================================================
   Bütün çevrilebilir içerik varlıklarının TEK doğruluk kaynağı:
     • çeviri tablosu + parent FK (migration 082/083/086/088/089/096/105)
     • çevrilebilir alanlar ve ana tablodaki KALICI AYNA kolonları
     • slug türü (102/103) — ana tablo `slug` = dil bağımsız teknik anahtar
   Hedef model: TR, EN ve DE AYNI çeviri tablolarında `locale` koduyla
   saklanır; ana tablodaki eski TR kolonları kalıcı aynadır.

   ⚠️ FAZ 1 SINIRI: Bu dosyayı henüz HİÇBİR çalışan kod import etmez.
   Mevcut okuma/yazma (`lib/i18n/get-*.server.ts`,
   `app/services/*-translation.service.ts`) DEĞİŞMEDİ. Faz 3–4'te
   merkezi servisler bu kayda bağlanacak.
   `TRANSLATION_ENTITY_CONFIG` (lib/i18n/translations.types.ts) ile
   tutarlılığı test edilir (tests/unit/symmetric-content-registry.test.ts).
   =============================================================== */

/** Migration 105 `content_mirror_mode()` değerleri. */
export type ContentMirrorMode = "base" | "translations";
export const CONTENT_MIRROR_MODES: readonly ContentMirrorMode[] = ["base", "translations"];

/** Ayna/backfill kodunun transaction-local olarak açtığı bayrak
 *  (`set_config(CONTENT_MIRROR_FLAG, 'on', true)`). Guard'lar tanır. */
export const CONTENT_MIRROR_FLAG = "app.content_mirror";

/** Çeviri tablolarında izin verilen diller (locale CHECK, 105 sonrası hepsi). */
export const CONTENT_LOCALES: readonly Locale[] = ["tr", "en", "de"];

export type ContentFieldKind = "text" | "jsonb";

export type ContentField = {
  /** Çeviri tablosundaki kolon. */
  name: string;
  /** Ana tablodaki kalıcı ayna kolonu (aynı ad). */
  baseColumn: string;
  kind: ContentFieldKind;
};

export type ContentEntityKey =
  | "villa"
  | "villa_type"
  | "villa_feature"
  | "rule_item"
  | "price_include_item"
  | "blog_post"
  | "page"
  | "faq"
  | "menu"
  | "payment_method"
  | "settings"
  | "site_popup"
  | "homepage_collection"
  | "discount_collection";

export type ContentEntityDef = {
  key: ContentEntityKey;
  /** Çeviri tablosu. */
  table: string;
  /** Ana tablo (içerik kimliği; FK ON DELETE CASCADE). */
  parentTable: string;
  /** Çeviri tablosundaki parent FK kolonu. */
  parentIdColumn: string;
  /** Ana tablo `id` tipi (doğrulanmış / varsayım). */
  parentIdType: "uuid" | "smallint";
  /** Çevrilebilir alanlar (slug HARİÇ). */
  fields: readonly ContentField[];
  /** Dil bazlı slug (102) → public URL; ana `slug` teknik anahtardır. */
  slugKind?: SlugKind;
  /** Tek satırlı ana tablo (settings, site_popup). */
  singleton?: boolean;
  /** Bu varlığı tanıtan migration. */
  migration: string;
};

const f = (name: string, kind: ContentFieldKind = "text"): ContentField => ({
  name,
  baseColumn: name,
  kind,
});

export const CONTENT_ENTITIES: readonly ContentEntityDef[] = [
  {
    key: "villa",
    table: "villa_translations",
    parentTable: "villa",
    parentIdColumn: "villa_id",
    parentIdType: "uuid",
    /* `title` çeviri tablosunda VAR ama atıl: villa adı özel isim (Phase 10F). */
    fields: [f("description"), f("badge"), f("seo_title"), f("seo_description")],
    slugKind: "villa",
    migration: "082",
  },
  {
    key: "villa_type",
    table: "villa_type_translations",
    parentTable: "villa_types",
    parentIdColumn: "type_id",
    parentIdType: "uuid",
    fields: [f("name")],
    slugKind: "villaType",
    migration: "082",
  },
  {
    key: "villa_feature",
    table: "villa_feature_translations",
    parentTable: "villa_features",
    parentIdColumn: "feature_id",
    parentIdType: "uuid",
    fields: [f("name")],
    migration: "082",
  },
  {
    key: "rule_item",
    table: "rule_item_translations",
    parentTable: "rule_items",
    parentIdColumn: "rule_id",
    parentIdType: "uuid",
    fields: [f("title")],
    migration: "082",
  },
  {
    key: "price_include_item",
    table: "price_include_item_translations",
    parentTable: "price_include_items",
    parentIdColumn: "include_id",
    parentIdType: "uuid",
    fields: [f("title")],
    migration: "082",
  },
  {
    key: "blog_post",
    table: "blog_post_translations",
    parentTable: "blog_posts",
    parentIdColumn: "blog_post_id",
    parentIdType: "uuid",
    fields: [f("title"), f("body"), f("excerpt"), f("seo_title"), f("seo_description")],
    slugKind: "blog",
    migration: "089",
  },
  {
    key: "page",
    table: "page_translations",
    parentTable: "pages",
    parentIdColumn: "page_id",
    parentIdType: "uuid",
    fields: [
      f("title"),
      f("body"),
      f("excerpt"),
      f("seo_title"),
      f("seo_description"),
      f("sections", "jsonb"),
    ],
    slugKind: "page",
    migration: "082",
  },
  {
    key: "faq",
    table: "faq_translations",
    parentTable: "faqs",
    parentIdColumn: "faq_id",
    /* 082 notu: faqs.id tipi doğrudan doğrulanamadı (Faz 0.1 Q1). */
    parentIdType: "uuid",
    fields: [f("question"), f("answer")],
    migration: "082",
  },
  {
    key: "menu",
    table: "menu_translations",
    parentTable: "menu",
    parentIdColumn: "menu_id",
    parentIdType: "uuid",
    fields: [f("name")],
    migration: "086",
  },
  {
    key: "payment_method",
    table: "payment_method_translations",
    parentTable: "payment_methods",
    parentIdColumn: "payment_method_id",
    parentIdType: "uuid",
    fields: [f("name")],
    migration: "088",
  },
  {
    key: "settings",
    table: "settings_translations",
    parentTable: "settings",
    parentIdColumn: "settings_id",
    parentIdType: "uuid",
    fields: [
      f("footer_copyright"),
      f("default_meta_title"),
      f("default_meta_description"),
      f("hero_title"),
      f("hero_subtitle"),
      f("hero_badge_text"),
      f("hero_primary_cta_text"),
      f("hero_secondary_cta_text"),
      f("business_hours"),
    ],
    singleton: true,
    migration: "083",
  },
  {
    key: "site_popup",
    table: "site_popup_translations",
    parentTable: "site_popup",
    parentIdColumn: "popup_id",
    parentIdType: "smallint",
    fields: [
      f("title"),
      f("description"),
      f("highlight_text"),
      f("stats", "jsonb"),
      f("button_text"),
      f("button_url"),
    ],
    singleton: true,
    migration: "096",
  },
  {
    key: "homepage_collection",
    table: "homepage_collection_translations",
    parentTable: "homepage_collections",
    parentIdColumn: "collection_id",
    parentIdType: "uuid",
    fields: [f("custom_title")],
    migration: "105",
  },
  {
    key: "discount_collection",
    table: "discount_collection_translations",
    parentTable: "discount_collections",
    parentIdColumn: "collection_id",
    parentIdType: "uuid",
    fields: [f("custom_title")],
    migration: "105",
  },
];

export const CONTENT_ENTITY_BY_KEY: Readonly<Record<ContentEntityKey, ContentEntityDef>> =
  Object.fromEntries(CONTENT_ENTITIES.map((e) => [e.key, e])) as Record<
    ContentEntityKey,
    ContentEntityDef
  >;

/** Okuma sırası (onaylı karar 4): istenen dil → ana dil → diğer aktif
 *  diller (site_locales sırası). Tekrarsız; yalnız aktif diller. */
export function contentFallbackChain(
  requested: Locale,
  root: Locale,
  enabled: readonly Locale[]
): Locale[] {
  const out: Locale[] = [];
  for (const l of [requested, root, ...enabled]) {
    if (enabled.includes(l) && !out.includes(l)) out.push(l);
  }
  return out;
}
