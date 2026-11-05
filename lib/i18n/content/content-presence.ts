import type { LocalizedContent } from "@/lib/i18n/content/content-contract";

/* ===============================================================
   🌐 İÇERİK VARLIĞI → 404 / NOINDEX KARARI — Faz 3.1 (SAF)
   ===============================================================
   Merkezi servis `null` döndüğünde (kaydın HİÇBİR AKTİF dilde satırı
   yok) modül bazında ne olacağı. Mevcut public route davranışları
   referans alındı:

     villa    → kayıt yoksa 404 (getVillaBySlug null, metadata
                index:false). Kayıt varsa sayfa açılır; villa her aktif
                dilde "mevcut" sayılır (content-availability notu) →
                isFallback noindex SEBEBİ DEĞİLDİR. İçerik HİÇ yoksa:
                açıklama boş (sözlükteki descriptionEmpty metni), SEO
                açıklaması boş, noindex,follow. Teknik anahtar/pasif dil
                metni GÖSTERİLMEZ.
     page     → kayıt yoksa 404 (TR: inline 404, EN/DE notFound()).
                İçerik HİÇ yoksa 404 — yanlış içerik gösterilmez.
                Yedek dilde ise sayfa açılır + noindex,follow (mevcut
                getContentLocales davranışı). page.noindex → noindex,nofollow.
     blog     → yayında değilse veya kayıt yoksa 404 (getBlogPostBySlug
                is_active filtresi). İçerik HİÇ yoksa 404; yedekte ise
                noindex,follow; post.noindex → noindex,nofollow.
     category → villa_types kaydı yoksa mevcut 404 akışı. Kategori
                sayfası her aktif dilde mevcut (liste sayfası) → index.
                Ad HİÇBİR aktif dilde yoksa sayfa açılır ama ad yerine
                sözlükteki genel etiket kullanılır (slug DEĞİL) ve
                noindex,follow.
     region   → villa_locations çeviri tablosu YOK (bölge adları özel
                isim, merkezi içerik kapsamı dışında) → mevcut davranış
                AYNEN: kayıt varsa index, yoksa 404.
     list     → (özellik, kural, fiyata dahil, SSS, menü, ödeme yöntemi,
                koleksiyon başlığı) içerik yoksa öğe GİZLENİR
                (koleksiyon başlığında çağıran villa adını kullanır —
                mevcut `custom_title || villa.title` kuralı).
     singleton→ (settings, site_popup) içerik yoksa sözlük/varsayılan
                değerler (mevcut resolveHeroContent / popup projeksiyonu).
   =============================================================== */

export type ContentModule = "villa" | "page" | "blog" | "category" | "region" | "list" | "singleton";

export type ContentRobots = "index" | "noindex-follow" | "noindex-nofollow";

export type ContentPresenceDecision =
  | { kind: "not-found"; reason: "record-missing" | "unpublished" | "no-content" }
  | {
      kind: "render";
      robots: ContentRobots;
      /** İçerik yok → çağıran sözlük/boş durum metnini kullanır. */
      useEmptyState: boolean;
      reason: "ok" | "fallback-language" | "no-content" | "record-noindex";
    }
  | { kind: "omit" }
  | { kind: "defaults" };

export type ContentPresenceInput = {
  /** Ana kayıt (villa / pages / blog_posts / villa_types …) mevcut mu. */
  recordExists: boolean;
  /** Blog: is_active. Diğerleri: verilmezse true. */
  published?: boolean;
  /** Kaydın kendi noindex bayrağı (pages.noindex / blog_posts.noindex). */
  recordNoindex?: boolean;
  /** Merkezi servis sonucu (null = hiçbir aktif dilde satır yok). */
  content: LocalizedContent | null;
};

function hasAnyValue(content: LocalizedContent | null): boolean {
  return !!content && content.missing.length < Object.keys(content.values).length;
}

export function decideContentPresence(
  module: ContentModule,
  input: ContentPresenceInput
): ContentPresenceDecision {
  const { recordExists, content } = input;
  const published = input.published ?? true;
  const present = hasAnyValue(content);

  switch (module) {
    case "list":
      return present ? { kind: "render", robots: "index", useEmptyState: false, reason: "ok" } : { kind: "omit" };
    case "singleton":
      return present ? { kind: "render", robots: "index", useEmptyState: false, reason: "ok" } : { kind: "defaults" };
    case "region":
      return recordExists
        ? { kind: "render", robots: "index", useEmptyState: false, reason: "ok" }
        : { kind: "not-found", reason: "record-missing" };
    default:
      break;
  }

  if (!recordExists) return { kind: "not-found", reason: "record-missing" };
  if (module === "blog" && !published) return { kind: "not-found", reason: "unpublished" };

  if (module === "page" || module === "blog") {
    if (!present) return { kind: "not-found", reason: "no-content" };
    if (input.recordNoindex) {
      return { kind: "render", robots: "noindex-nofollow", useEmptyState: false, reason: "record-noindex" };
    }
    return content!.isFallback
      ? { kind: "render", robots: "noindex-follow", useEmptyState: false, reason: "fallback-language" }
      : { kind: "render", robots: "index", useEmptyState: false, reason: "ok" };
  }

  /* villa, category: kayıt var → sayfa her aktif dilde açılır. */
  if (!present) {
    return { kind: "render", robots: "noindex-follow", useEmptyState: true, reason: "no-content" };
  }
  return { kind: "render", robots: "index", useEmptyState: false, reason: "ok" };
}
