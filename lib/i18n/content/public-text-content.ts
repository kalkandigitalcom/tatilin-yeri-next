import type { Locale } from "@/lib/i18n/config";
import type { LocalizedContent } from "@/lib/i18n/content/content-contract";
import { decideContentPresence } from "@/lib/i18n/content/content-presence";
import { contentText, type PublicContentReader } from "@/lib/i18n/content/public-villa-content";
import { textAvailableLocales, type ContentsByLocale } from "@/lib/i18n/content/public-seo-content";

/* ===============================================================
   🌐 PUBLIC BLOG / CMS İÇERİĞİ — Faz 6 Dalga 3 (SAF)
   ===============================================================
   Blog yazısı (blog_post) ve CMS sayfası (page) çevrilebilir alanları
   yalnız merkezi okuma servisinden gelir (getContent/getContentMany).
   IO yapmaz; okuyucu dışarıdan verilir.

   KURALLAR (Faz 3 / 3.1 / Faz 5 kararları — yeniden icat edilmedi):
     • Yedek zinciri merkezi serviste: istenen → ana dil → diğer AKTİF
       diller; pasif dil yok; TR'ye özel kısayol / TR ana kolon yedeği yok.
     • Gövde (body): bilinçli boş ("") zinciri durdurur ve "" döner
       (Faz 5 son kontroller). Bu yüzden gövde değeri HAM taşınır;
       diğer metinler boş/boşluk ise null.
     • CMS gövdesi: TR satırı NULL ise pages.content ek yedeği merkezi
       depoda (Faz 3.1); bölümler (sections) geçerli bölüm yoksa yedeğe düşer.
     • "Bu dilde gerçek çeviri var" = title | body | excerpt istenen dilde
       dolu (isFallback=false) — eski content-availability kuralının
       simetrik karşılığı (TR artık "daima mevcut" sayılmaz).
     • 404 / noindex: decideContentPresence("blog" | "page").
   =============================================================== */

export type TextEntity = "blog_post" | "page";

export type ResolvedTextContent = {
  title: string | null;
  excerpt: string | null;
  body: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  /** CMS bölümleri (HAM JSONB); blog'da null. */
  sections: unknown;
};

export const EMPTY_TEXT_CONTENT: ResolvedTextContent = {
  title: null,
  excerpt: null,
  body: null,
  seoTitle: null,
  seoDescription: null,
  sections: null,
};

export function resolvedTextFrom(content: LocalizedContent | null | undefined): ResolvedTextContent {
  if (!content) return EMPTY_TEXT_CONTENT;
  const body = content.values.body;
  return {
    title: contentText(content, "title"),
    excerpt: contentText(content, "excerpt"),
    /* Bilinçli boş ("") korunur; NULL / yok → null. */
    body: typeof body === "string" ? body : null,
    seoTitle: contentText(content, "seo_title"),
    seoDescription: contentText(content, "seo_description"),
    sections: content.values.sections ?? null,
  };
}

/** Faz 3.1: içerik hiçbir aktif dilde yoksa blog/CMS sayfası 404. */
export function isTextContentMissing(entity: TextEntity, content: LocalizedContent | null | undefined): boolean {
  return (
    decideContentPresence(entity === "blog_post" ? "blog" : "page", { recordExists: true, content: content ?? null })
      .kind === "not-found"
  );
}

export type LoadedText = { content: LocalizedContent | null; resolved: ResolvedTextContent };

export async function loadTextContent(
  reader: PublicContentReader,
  entity: TextEntity,
  id: string,
  locale: Locale
): Promise<LoadedText> {
  const content = await reader.getContent(entity, id, locale);
  return { content, resolved: resolvedTextFrom(content) };
}

/** Liste: TEK batch. İçeriği hiçbir aktif dilde olmayan kayıt haritada YOK
 *  (detayı zaten 404 olur → listede gösterilmez). */
export async function loadTextContentMany(
  reader: PublicContentReader,
  entity: TextEntity,
  ids: readonly string[],
  locale: Locale
): Promise<Map<string, LoadedText>> {
  const unique = Array.from(new Set(ids.map(String).filter((x) => x.trim() !== "")));
  const out = new Map<string, LoadedText>();
  if (unique.length === 0) return out;
  const many = await reader.getContentMany(entity, unique, locale);
  for (const id of unique) {
    const c = many.get(id) ?? null;
    if (isTextContentMissing(entity, c)) continue;
    out.set(id, { content: c, resolved: resolvedTextFrom(c) });
  }
  return out;
}

/** Bu kaydın GERÇEK çevirisi olan aktif diller (hreflang / noindex).
 *  `requested` için zaten okunmuş içerik verilirse o dil tekrar okunmaz.
 *  Tek dilli sitede (aktif dil < 2) okuma yapılmaz → aktif diller (eski
 *  davranış: "çeviri sorgusu atılmaz"). */
export async function loadAvailableLocales(
  reader: PublicContentReader,
  entity: TextEntity,
  id: string,
  enabled: readonly Locale[],
  known?: { locale: Locale; content: LocalizedContent | null }
): Promise<Locale[]> {
  if (enabled.length < 2) return [...enabled];
  /* 🌐 Faz 6 Dalga 5 — karar sitemap ile ORTAK saf kuraldan
     (public-seo-content `textAvailableLocales`). */
  const contents: ContentsByLocale = {};
  await Promise.all(
    enabled.map(async (l) => {
      contents[l] = known && known.locale === l ? known.content : await reader.getContent(entity, id, l);
    })
  );
  return textAvailableLocales(contents, enabled);
}

export type TextRobots = { index: boolean; follow: boolean } | undefined;

/**
 * Robots kararı — mevcut SEO davranışı AYNEN:
 *   kayıt noindex → noindex,nofollow · bu dilde gerçek çeviri yok →
 *   noindex,follow · aksi halde blog: robots verilmez (kök layout),
 *   CMS: açık index,follow (eski cms-page-metadata davranışı).
 */
export function textRobots(
  module: "blog" | "page",
  recordNoindex: boolean | null | undefined,
  translatedHere: boolean
): TextRobots {
  if (recordNoindex) return { index: false, follow: false };
  if (!translatedHere) return { index: false, follow: true };
  return module === "page" ? { index: true, follow: true } : undefined;
}
