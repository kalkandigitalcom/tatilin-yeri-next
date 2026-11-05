import type { Locale } from "@/lib/i18n/config";
import type { LocalizedContent } from "@/lib/i18n/content/content-contract";
import type { ContentEntityKey } from "@/lib/i18n/content/content-registry";
import { decideContentPresence } from "@/lib/i18n/content/content-presence";
import type { PublicContentReader } from "@/lib/i18n/content/public-villa-content";

/* ===============================================================
   🌐 PUBLIC SEO KARARLARI — Faz 6 Dalga 5 (SAF)
   ===============================================================
   Sayfa metadata'sı (robots + hreflang) ve sitemap AYNI kuralı buradan
   kullanır. Kurallar Faz 3.1 / Faz 6 Dalga 2–3 onaylı kararlarıdır;
   burada yeniden icat edilmedi, yalnız tek yere toplandı:

   • Blog / CMS (TEXT):
       – içerik hiçbir aktif dilde yok → sayfa 404 → hiçbir dilde yok;
       – kayıt noindex → noindex,nofollow → sitemap'te yok;
       – dil l "çevrili" = l'de başlık | gövde | özet dolu
         (isFallback=false); çevrili olmayan dil noindex,follow + hreflang
         dışı → sitemap'te yok;
       – tek dilli site (aktif dil < 2) → okuma yok, aktif diller.
   • Villa: kayıt noindex → noindex,nofollow; hiçbir aktif dilde içerik
       yok → noindex,follow; başka aktif dilden yedekle içerik varsa
       İNDEXLENİR (onaylı karar). İndexlenebilirse bütün aktif diller.
   • Kategori: ad hiçbir aktif dilde yok → noindex,follow; ad varsa
       bütün aktif diller (villa sayısı kuralı çağıranda, değişmedi).
   • Pasif dil hiçbir sonuçta yer almaz (girdi daima aktif diller).
   =============================================================== */

export type ContentsByLocale = Partial<Record<Locale, LocalizedContent | null>>;

/** Bu dilde GERÇEK çeviri var mı (yedek değil)? */
export function isTranslatedHere(content: LocalizedContent | null | undefined): boolean {
  return !!content && !content.isFallback;
}

/** Blog / CMS: içeriğin GERÇEKTEN çevrili olduğu aktif diller (hreflang kümesi).
 *  Tek dilli sitede aktif diller (okuma yapılmaz). */
export function textAvailableLocales(contents: ContentsByLocale, enabled: readonly Locale[]): Locale[] {
  if (enabled.length < 2) return [...enabled];
  return enabled.filter((l) => isTranslatedHere(contents[l]));
}

/** Blog / CMS: sayfanın İNDEXLENEBİLİR olduğu diller (= sitemap dilleri). */
export function textIndexableLocales(
  entity: "blog_post" | "page",
  recordNoindex: boolean | null | undefined,
  contents: ContentsByLocale,
  enabled: readonly Locale[]
): Locale[] {
  if (recordNoindex) return [];
  const any = enabled.map((l) => contents[l]).find((c) => c !== undefined) ?? null;
  const presence = decideContentPresence(entity === "blog_post" ? "blog" : "page", {
    recordExists: true,
    content: any,
  });
  if (presence.kind === "not-found") return [];
  return textAvailableLocales(contents, enabled);
}

/** Villa / kategori: içerik hiçbir aktif dilde yok mu? (dile bağımsız) */
export function hasNoContentAnywhere(content: LocalizedContent | null | undefined): boolean {
  const d = decideContentPresence("villa", { recordExists: true, content: content ?? null });
  return d.kind === "render" && d.robots === "noindex-follow";
}

/** Villa: indexlenebilir diller (= sitemap dilleri). */
export function villaIndexableLocales(
  content: LocalizedContent | null | undefined,
  recordNoindex: boolean | null | undefined,
  enabled: readonly Locale[]
): Locale[] {
  if (recordNoindex || hasNoContentAnywhere(content)) return [];
  return [...enabled];
}

/** Villa / kategori sayfa hreflang kümesi: içerik hiç yoksa (noindex,follow)
 *  hreflang basılmaz → `[]`; aksi halde `undefined` (bütün aktif diller). */
export function contentHreflangAvailability(hasContent: boolean): Locale[] | undefined {
  return hasContent ? undefined : [];
}

/** Kategori: indexlenebilir diller (ad + villa sayısı). */
export function categoryIndexableLocales(hasContent: boolean, villaCount: number, enabled: readonly Locale[]): Locale[] {
  return hasContent && villaCount > 0 ? [...enabled] : [];
}

/** id → dil → içerik; dil başına TEK batch. */
export async function loadContentsByLocale(
  reader: PublicContentReader,
  entity: ContentEntityKey,
  ids: readonly string[],
  locales: readonly Locale[]
): Promise<Map<string, ContentsByLocale>> {
  const unique = Array.from(new Set(ids.map(String).filter((x) => x.trim() !== "")));
  const out = new Map<string, ContentsByLocale>();
  if (unique.length === 0 || locales.length === 0) return out;
  const maps = await Promise.all(locales.map((l) => reader.getContentMany(entity, unique, l)));
  for (const id of unique) {
    const row: ContentsByLocale = {};
    locales.forEach((l, i) => {
      row[l] = maps[i].get(id) ?? null;
    });
    out.set(id, row);
  }
  return out;
}
