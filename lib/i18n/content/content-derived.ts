import { stripHtml } from "@/lib/html-sanitize";
import type { LocalizedContent } from "@/lib/i18n/content/content-contract";

/* ===============================================================
   🌐 TÜRETİLMİŞ ALANLAR — Faz 3.1 uyumluluk (SAF)
   ===============================================================
   Eski okuma katmanında bir alanın yedeği BAŞKA BİR ALAN olabiliyordu.
   Merkezi zincir yalnız aynı alanın diğer dillerine baktığı için bu
   kurallar burada açıkça uygulanır. Bugün tespit edilen tek örnek:

   villa.seo_description (lib/i18n/get-villa-translation.server.ts
   getVillaTranslatedSeoDescription):
     istenen dilin seo_description'ı → yoksa İSTENEN DİLDEKİ açıklamanın
     (o da yoksa yedek açıklamanın) 160 karakterlik düz metin özeti.
   Yani başka dilin seo_description'ı, istenen dildeki açıklama
   özetinin ÖNÜNE geçmez. (Diğer çapraz yedekler — blog/sayfa meta
   açıklaması seo_description → excerpt → body özeti, CMS başlığı
   seo_title → title → sözlük, koleksiyon custom_title → villa adı —
   zaten çağıran tarafta çözülmüş alanlar üzerinde çalışır; merkezi
   servisle sonuçları aynıdır.)
   =============================================================== */

export function makeContentExcerpt(text: string | undefined | null, max = 160): string {
  const clean = (text || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1).trimEnd() + "…";
}

export function resolveVillaSeoDescription(content: LocalizedContent | null): string {
  if (!content) return "";
  const requested = content.requestedLocale;
  const own = content.values.seo_description;
  if (
    typeof own === "string" &&
    own.trim() !== "" &&
    (requested === undefined || content.sourceLocale.seo_description === requested)
  ) {
    return own.trim();
  }
  const description = content.values.description;
  return makeContentExcerpt(stripHtml(typeof description === "string" ? description : ""), 160);
}
