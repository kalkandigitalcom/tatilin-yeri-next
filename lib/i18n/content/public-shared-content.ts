import type { Locale } from "@/lib/i18n/config";
import type { ContentEntityDef, ContentEntityKey } from "@/lib/i18n/content/content-registry";
import type { ContentValues } from "@/lib/i18n/content/content-contract";
import { isContentFieldFilled } from "@/lib/i18n/content/content-field-rules";
import { decideContentPresence } from "@/lib/i18n/content/content-presence";
import { contentLocaleContextFromSettings } from "@/lib/i18n/content/content-locale-context";
import { contentText, loadContentLabels, type PublicContentReader } from "@/lib/i18n/content/public-villa-content";

/* ===============================================================
   🌐 PUBLIC ORTAK İÇERİK — Faz 6 Dalga 4 (SAF)
   ===============================================================
   Ana sayfa, koleksiyonlar ve ortak bileşenler (header, footer, popup,
   iletişim) için merkezi okuma yardımcıları. IO yapmaz.

   1) TEKİL KAYITLAR (settings, site_popup) — "site ayarı" kuralı
      Eski davranış: istenen dilin DOLU değeri → yoksa TR ana kolonu
      OLDUĞU GİBİ (boş "" = admin bilinçli boşalttı → gizle; NULL →
      sözlük varsayılanı). Simetrik karşılığı (TR yerine ANA DİL):
        a) istenen dil (aktifse) alan kuralına göre doluysa → o değer;
        b) ana dilin satırı varsa → ana dilin değeri OLDUĞU GİBİ
           (boş/NULL dahil — yedek zinciri burada durur);
        c) ana dil satırı hiç yoksa → diğer AKTİF dillerden ilk dolu.
      Pasif dil hiçbir adımda kullanılmaz. Ana dil TR iken çıktı eski
      sistemle birebir (TR satırı = ana tablo aynası, migration 107).
      Neden genel zincir değil: ana dilde bilerek boşaltılan hero
      başlığı / CTA / popup metni başka dilden doldurulursa tek sayfada
      karışık dil oluşur; eski sistem bunu hiç yapmıyordu.

   2) ETİKET HARİTALARI (header/footer gibi dili istemcide seçen
      bileşenler) — her AKTİF dil için merkezi zincirle çözülmüş etiket
      (dil başına TEK batch). Hiçbir aktif dilde etiketi olmayan öğe
      haritada yoktur; çağıran onu GİZLER (ana tablo metnine düşmez).

   3) KOLEKSİYON ÖZEL BAŞLIĞI (K6) — merkezi zincirle çözülmüş
      custom_title; yoksa villa adı (Faz 3.1 kuralı: null → villa adı).
   =============================================================== */

export type SingletonRows = Partial<Record<Locale, ContentValues>>;
export type LocaleCtx = { root: Locale; enabled: readonly Locale[] };

/** Zaten okunmuş ayarlardan dil bağlamı (ek ayar okuması yok). */
export function publicLocaleCtxFromSettings(settings: Parameters<typeof contentLocaleContextFromSettings>[0]): LocaleCtx {
  return contentLocaleContextFromSettings(settings);
}

export function resolveSingletonFields(
  def: Pick<ContentEntityDef, "key" | "fields">,
  rows: SingletonRows,
  requested: Locale,
  ctx: LocaleCtx,
  /** 🌐 Faz 6 Dalga 5 — false: ana dil satırı yoksa diğer aktif dillere
   *  BAKILMAZ (null → çağıranın sözlük yedeği). Kök layout varsayılan
   *  başlığı için (karar B: kendi dili → ana dil → sözlük). */
  opts: { otherActiveFallback?: boolean } = {}
): Record<string, unknown> {
  const enabled = ctx.enabled.includes(ctx.root) ? ctx.enabled : [ctx.root, ...ctx.enabled];
  const out: Record<string, unknown> = {};
  for (const field of def.fields) {
    const own = enabled.includes(requested) ? rows[requested] : undefined;
    if (own && isContentFieldFilled(def, field, own[field.name])) {
      out[field.name] = own[field.name];
      continue;
    }
    const rootRow = rows[ctx.root];
    if (rootRow) {
      out[field.name] = rootRow[field.name] ?? null;
      continue;
    }
    let found: unknown = null;
    if (opts.otherActiveFallback === false) {
      out[field.name] = null;
      continue;
    }
    for (const l of enabled) {
      if (l === requested || l === ctx.root) continue;
      const v = rows[l]?.[field.name];
      if (isContentFieldFilled(def, field, v)) {
        found = v;
        break;
      }
    }
    out[field.name] = found;
  }
  return out;
}

/** TR satırı henüz aynalanmamışsa (migration 107 öncesi durum) ana tablo
 *  TR içeriğidir → TR satırı yerine o kullanılır. TR pasifse EKLENMEZ. */
export function withBaseTrRow(
  rows: SingletonRows,
  base: Record<string, unknown> | null | undefined,
  fields: readonly { name: string }[],
  ctx: LocaleCtx
): SingletonRows {
  if (rows.tr || !base || !ctx.enabled.includes("tr")) return rows;
  const tr: Record<string, unknown> = {};
  for (const f of fields) tr[f.name] = base[f.name] ?? null;
  return { ...rows, tr: tr as SingletonRows["tr"] };
}

/** Bütün aktif diller için tekil kayıt çözümü (istemci dil seçer). */
export function resolveSingletonByLocale(
  def: Pick<ContentEntityDef, "key" | "fields">,
  rows: SingletonRows,
  ctx: LocaleCtx
): Partial<Record<Locale, Record<string, unknown>>> {
  const out: Partial<Record<Locale, Record<string, unknown>>> = {};
  for (const l of ctx.enabled) out[l] = resolveSingletonFields(def, rows, l, ctx);
  return out;
}

export type LabelsByLocale = Partial<Record<Locale, string>>;

/** id → { dil → etiket } (her aktif dil için TEK batch; dil zinciri merkezi). */
export async function loadLabelMapsByLocale(
  reader: PublicContentReader,
  entity: ContentEntityKey,
  field: string,
  ids: readonly (string | number)[],
  enabled: readonly Locale[]
): Promise<Record<string, LabelsByLocale>> {
  const out: Record<string, LabelsByLocale> = {};
  if (ids.length === 0) return out;
  const maps = await Promise.all(enabled.map((l) => loadContentLabels(reader, entity, field, ids, l)));
  enabled.forEach((l, i) => {
    for (const [id, label] of maps[i]) (out[id] ??= {})[l] = label;
  });
  return out;
}

/** Koleksiyon kartı başlığı: çözülmüş custom_title → yoksa villa adı. */
export function collectionDisplayTitle(
  titles: Map<string, string>,
  collectionId: string | null | undefined,
  villaTitle: string
): string {
  const t = collectionId ? titles.get(String(collectionId)) : undefined;
  return t !== undefined ? t.trim() || villaTitle : villaTitle;
}

export type CollectionCard = {
  id: string;
  collection_id?: string | null;
  title: string;
  display_title: string;
};

/** Ana sayfa / indirim koleksiyonu kart metinleri — koleksiyon başına İKİ
 *  batch (özel başlık + villa rozeti), N+1 yok. Sıra ve kart kümesi
 *  DEĞİŞMEZ: başlık her zaman bir değer üretir (özel başlık → villa adı);
 *  rozet hiçbir aktif dilde yoksa gösterilmez (Dalga 2 rozet kuralı). */
export async function loadCollectionCardTexts(
  reader: PublicContentReader,
  entity: "homepage_collection" | "discount_collection",
  cards: readonly CollectionCard[],
  locale: Locale
): Promise<{ title: (c: CollectionCard) => string; badge: (villaId: string) => string | undefined }> {
  const collectionIds = cards.map((c) => c.collection_id).filter((x): x is string => !!x);
  const [titles, badges] = await Promise.all([
    loadContentLabels(reader, entity, "custom_title", collectionIds, locale),
    loadContentLabels(reader, "villa", "badge", cards.map((c) => c.id), locale),
  ]);
  return {
    /* Kimliksiz (alan eklenmeden önceki cache girdisi) → eski display_title. */
    title: (c) => (c.collection_id ? collectionDisplayTitle(titles, c.collection_id, c.title) : c.display_title),
    badge: (id) => badges.get(String(id)),
  };
}

export type FaqItem = { id: string; question: string; answer: string };

/** SSS (faq) — TEK batch; sıra ana tablodaki gibi. Soru veya cevap hiçbir
 *  aktif dilde yoksa öğe GİZLENİR (yarım SSS / boş FAQPage cevabı yok).
 *  Alan zinciri merkezi serviste: istenen → ana dil → diğer aktif diller. */
export async function localizeFaqs<T extends FaqItem>(
  reader: PublicContentReader,
  faqs: readonly T[],
  locale: Locale
): Promise<T[]> {
  if (faqs.length === 0) return [];
  const many = await reader.getContentMany("faq", faqs.map((f) => String(f.id)), locale);
  const out: T[] = [];
  for (const f of faqs) {
    const c = many.get(String(f.id)) ?? null;
    if (decideContentPresence("list", { recordExists: true, content: c }).kind === "omit") continue;
    const question = contentText(c, "question");
    const answer = contentText(c, "answer");
    if (question === null || answer === null) continue;
    out.push(question === f.question && answer === f.answer ? f : { ...f, question, answer });
  }
  return out;
}
