import type { Locale } from "@/lib/i18n/config";
import type { LocalizedContent } from "@/lib/i18n/content/content-contract";
import type { ContentEntityKey } from "@/lib/i18n/content/content-registry";
import { decideContentPresence } from "@/lib/i18n/content/content-presence";
import { resolveVillaSeoDescription } from "@/lib/i18n/content/content-derived";

/* ===============================================================
   🌐 PUBLIC VİLLA / KATEGORİ İÇERİĞİ — Faz 6 Dalga 2 (SAF)
   ===============================================================
   Villa listeleme, villa detay ve kategori sayfalarının ÇEVRİLEBİLİR
   içeriği yalnız merkezi okuma servisinden (getContent/getContentMany)
   gelir. Bu dosya IO yapmaz; okuyucu dışarıdan verilir (sunucuda
   `public-villa-content.server.ts`, testte çekirdek servis veya sahte).

   KURALLAR (Faz 3 / 3.1 kararları — burada yeniden icat edilmedi):
     • Yedek zinciri merkezi serviste: istenen → ana dil → diğer AKTİF
       diller. Pasif dil zincire girmez. TR'ye özel kısayol YOK; eski
       "TR ana kolonuna düş" yedeği KULLANILMAZ.
     • Boş / yalnız boşluk değer "yok" sayılır (eski resolveTranslatedField
       ile aynı ilke).
     • Liste öğeleri (özellik, kural, fiyata dahil, rozet) hiçbir aktif
       dilde yoksa GİZLENİR (decideContentPresence "list").
     • Villa: kayıt varsa her aktif dilde açılır; yedek dil noindex
       sebebi DEĞİLDİR (Faz 3.1). Hiç içerik yoksa noindex,follow.
       villa.noindex → noindex,nofollow (artık her dilde).
     • Kategori: ad hiçbir aktif dilde yoksa sözlükteki genel etiket
       (slug DEĞİL) + noindex,follow.
     • Teknik veriler (fiyat, takvim, galeri, kapasite, mesafe değeri,
       ilişkiler, bölge adı, villa adı) bu katmana HİÇ girmez.
   =============================================================== */

export type PublicContentReader = {
  getContent(entity: ContentEntityKey, parentId: string, locale: Locale): Promise<LocalizedContent | null>;
  getContentMany(
    entity: ContentEntityKey,
    parentIds: readonly string[],
    locale: Locale
  ): Promise<Map<string, LocalizedContent>>;
};

/** Alanın dolu metin değeri; yoksa / boşsa null. */
export function contentText(content: LocalizedContent | null | undefined, field: string): string | null {
  const v = content?.values?.[field];
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

export type PublicRobots = { index: false; follow: boolean };

/** Villa detay robots kararı. `undefined` → kök layout politikası miras. */
export function villaRobots(content: LocalizedContent | null, villaNoindex: boolean | null | undefined): PublicRobots | undefined {
  if (villaNoindex) return { index: false, follow: false };
  const d = decideContentPresence("villa", { recordExists: true, content });
  if (d.kind === "render" && d.robots === "noindex-follow") return { index: false, follow: true };
  return undefined;
}

export type VillaDetailContent = {
  content: LocalizedContent | null;
  /** Gövde açıklaması (HTML); yoksa null → gövde sözlükteki boş metni gösterir. */
  description: string | null;
  seoTitle: string | null;
  seoDescription: string;
};

export async function loadVillaDetailContent(
  reader: PublicContentReader,
  villaId: string,
  locale: Locale
): Promise<VillaDetailContent> {
  const content = await reader.getContent("villa", villaId, locale);
  return {
    content,
    description: contentText(content, "description"),
    seoTitle: contentText(content, "seo_title")?.trim() ?? null,
    seoDescription: resolveVillaSeoDescription(content),
  };
}

/** Liste etiketleri: kimlik → metin. Hiçbir aktif dilde olmayan öğe haritada YOK. */
export async function loadContentLabels(
  reader: PublicContentReader,
  entity: ContentEntityKey,
  field: string,
  ids: readonly (string | number)[],
  locale: Locale
): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids.map((x) => String(x)).filter((x) => x.trim() !== "")));
  const out = new Map<string, string>();
  if (unique.length === 0) return out;
  const many = await reader.getContentMany(entity, unique, locale);
  for (const id of unique) {
    const c = many.get(id) ?? null;
    if (decideContentPresence("list", { recordExists: true, content: c }).kind === "omit") continue;
    const text = contentText(c, field);
    if (text !== null) out.set(id, text);
  }
  return out;
}

/** Sıra korunarak etiketlenen öğeler; etiketi olmayan öğe GİZLENİR. */
export function labelItems<T extends { id: string | number }, R>(
  items: readonly T[],
  labels: Map<string, string>,
  map: (item: T, label: string) => R
): R[] {
  const out: R[] = [];
  for (const it of items) {
    const label = labels.get(String(it.id));
    if (label !== undefined) out.push(map(it, label));
  }
  return out;
}

export type CategoryName = { name: string; hasContent: boolean };

/** Kategori (villa_type) adı; yoksa genel etiket (slug DEĞİL). */
export function resolveCategoryName(
  labels: Map<string, string>,
  id: string | number,
  genericLabel: string
): CategoryName {
  const name = labels.get(String(id));
  return name !== undefined ? { name, hasContent: true } : { name: genericLabel, hasContent: false };
}
