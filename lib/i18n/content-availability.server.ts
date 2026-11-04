import "server-only";

import { getTranslation } from "@/lib/i18n/get-translation.server";
import type { Locale } from "@/lib/i18n/config";

/* ===============================================================
   🌐 İÇERİK ÇEVİRİ KAPSAMI — Çok Dilli Mimari Faz 3 (SEO)
   ===============================================================
   Metin ağırlıklı içeriklerde (blog yazısı, CMS sayfası) bir dilin
   "gerçek çeviri" sayılması için o dilde başlık, gövde veya özet
   dolu bir çeviri satırı olmalıdır. Çevirisi olmayan dilde sayfa TR
   metniyle (fallback) açılmaya devam eder, ANCAK:
     • noindex,follow alır,
     • hreflang'de ve sitemap'te yer almaz,
     • başka bir sayfaya canonical VERİLMEZ (kendi URL'si kalır).
   TR (taban içerik) her zaman mevcuttur.
   Villa / kategori / bölge / statik sayfalarda arayüz tamamen
   çevrilidir ve ana içerik özel isimler + listelerdir → bu sayfalar
   her aktif dilde mevcut sayılır (bu yardımcı kullanılmaz).
   =============================================================== */

type TextRow = {
  locale?: string | null;
  title?: string | null;
  body?: string | null;
  excerpt?: string | null;
};

function hasText(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

export function translatedLocalesFromRows(rows: readonly TextRow[]): Locale[] {
  const out: Locale[] = ["tr"];
  for (const r of rows) {
    const l = r?.locale;
    if ((l === "en" || l === "de") && (hasText(r.title) || hasText(r.body) || hasText(r.excerpt))) {
      if (!out.includes(l)) out.push(l);
    }
  }
  return out;
}

export async function getContentLocales(
  kind: "blog" | "page",
  id: string | null | undefined
): Promise<Locale[]> {
  const parentId = (id ?? "").toString().trim();
  if (!parentId) return ["tr"];
  /* Sayfa gövdesinin kullandığı AYNI okuyucu (request-scoped cache'li)
     → içerik ve SEO kararı aynı veriye dayanır. */
  const entity = kind === "blog" ? "blog_post" : "page";
  const rows = await Promise.all(
    (["en", "de"] as const).map(async (locale) => {
      try {
        const row = await getTranslation(entity, parentId, locale);
        return row ? { ...(row as TextRow), locale } : null;
      } catch {
        return null;
      }
    })
  );
  return translatedLocalesFromRows(rows.filter((r) => r !== null) as TextRow[]);
}
