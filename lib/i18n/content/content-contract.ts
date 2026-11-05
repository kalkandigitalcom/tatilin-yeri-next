import type { Locale } from "@/lib/i18n/config";
import type { ContentEntityKey } from "@/lib/i18n/content/content-registry";

/* ===============================================================
   🌐 MERKEZİ İÇERİK SERVİS SÖZLEŞMESİ — Seçenek D, Faz 1 (yalnız TİP)
   ===============================================================
   Faz 3 (okuma) ve Faz 4 (yazma) servislerinin uygulayacağı arayüz.
   Bu dosyada ÇALIŞAN KOD YOK; hiçbir mevcut modül import etmez.
   =============================================================== */

/** Bir varlığın çevrilebilir alan değerleri (alan adı → değer). */
export type ContentValues = Record<string, string | unknown | null>;

export type LocalizedContent = {
  values: ContentValues;
  /** Her alanın hangi dilden geldiği (yedek zinciri). */
  sourceLocale: Record<string, Locale | null>;
  /** Hiçbir dilde dolu olmayan alanlar. */
  missing: string[];
  /** İstenen dilde içerik yok, yedekten gösteriliyor → noindex (karar 5). */
  isFallback: boolean;
  /** Dil bazlı public slug (yoksa teknik anahtar kullanılır). */
  slug?: string | null;
  /** Faz 3: istenen dil DIŞINDAN (yedekten) gelen alanlar (kısmi yedek). */
  fallbackFields?: string[];
  /** Faz 3: çözümlemenin yapıldığı istenen dil. */
  requestedLocale?: Locale;
  /** Faz 5 son kontroller: bilinçli boş ("") olduğu için zinciri durduran
   *  alanlar (blog/sayfa gövdesi). Değer "" döner; `missing` içinde de yer alır. */
  explicitEmpty?: string[];
};

export type ContentReadOptions = {
  /** Varsayılan: contentFallbackChain(requested, root, enabled). */
  fallback?: readonly Locale[];
};

/** Faz 3: bir varlığın tek dildeki doluluğu (yedek UYGULANMADAN, ham). */
export type ContentCoverage = {
  total: number;
  filled: Record<string, number>;
  /** Faz 3 eki: bu dilde satırı olan kayıt sayısı. */
  rows?: number;
  /** Faz 3 eki: slugKind'li varlıklarda bu dilde dolu slug sayısı. */
  slugFilled?: number;
};

export interface ContentReadService {
  getContent(
    entity: ContentEntityKey,
    parentId: string,
    locale: Locale,
    opts?: ContentReadOptions
  ): Promise<LocalizedContent | null>;
  /** Tek batch sorgu; N+1 yok. */
  getContentMany(
    entity: ContentEntityKey,
    parentIds: readonly string[],
    locale: Locale,
    opts?: ContentReadOptions
  ): Promise<Map<string, LocalizedContent>>;
  /** Admin: bütün dillerin ham değerleri. */
  getAllLocales(
    entity: ContentEntityKey,
    parentId: string
  ): Promise<Partial<Record<Locale, ContentValues & { slug?: string | null }>>>;
  /** Ana dil değişimi preflight'ı: dil başına doluluk. */
  getCoverage(
    entity: ContentEntityKey,
    locale: Locale
  ): Promise<ContentCoverage>;
}

/** Faz 4: hata sınıfları. guard = 105/106 ayna koruması reddetti;
 *  not-found = ana kayıt yok; busy = kilit zaman aşımı; disabled = servis
 *  bu ortamda kapalı (Faz 5 öncesi varsayılan). */
export type ContentWriteErrorCode =
  | "guard"
  | "validation"
  | "conflict"
  | "db"
  | "not-found"
  | "busy"
  | "disabled";

export type ContentWriteResult =
  | {
      ok: true;
      /** Faz 4: hedef satır bu yazmayla mı oluştu (false = güncellendi). */
      created?: boolean;
      /** Faz 4: yazılan taraf — "base" (TR ana kolon, mod=base) | "translation". */
      target?: "base" | "translation";
      /** Faz 4: DB'deki ayna modu. */
      mode?: "base" | "translations";
      /** Faz 4: yazılan alanlar (slug dahil). */
      written?: string[];
      /** Faz 4: normalize edilmiş slug (slug gönderildiyse). */
      slug?: string | null;
    }
  | { ok: false; error: string; field?: string; code?: ContentWriteErrorCode; index?: number };

/** Faz 5 — EKSİK / NULL / BOŞ sözleşmesi (yazma):
 *    anahtar yok → alana dokunulmaz
 *    null        → NULL (değer yok; page.body için eski pages.content
 *                  yedeği okuma tarafında GÖRÜNÜR)
 *    ""          → bilerek boşaltıldı (page.body: eski content GÖRÜNMEZ)
 *  Admin editörü boşaltılan metin alanını daima "" olarak gönderir. */
/** Faz 4: toplu yazmada tek öğe. */
export type ContentWriteItem = {
  entity: ContentEntityKey;
  parentId: string;
  locale: Locale;
  patch: ContentValues & { slug?: string | null };
};

export interface ContentWriteService {
  /** Yazma hedefi DB'deki `content_mirror_mode()` ile seçilir:
   *  base → TR ana kolona (ayna tr satırını günceller), EN/DE çeviri satırına;
   *  translations → bütün diller çeviri satırına (ayna ana kolonu günceller).
   *  Slug: format + aynı dilde çakışma (slug-validation.server.ts). */
  saveContent(
    entity: ContentEntityKey,
    parentId: string,
    locale: Locale,
    patch: ContentValues & { slug?: string | null },
    ctx: { actorId: string }
  ): Promise<ContentWriteResult>;
  /** Faz 4: tek transaction, deterministik kilit sırası; bir öğe hata
   *  verirse HİÇBİRİ yazılmaz. */
  saveContentMany?(
    items: readonly ContentWriteItem[],
    ctx: { actorId: string }
  ): Promise<{ ok: true; results: ContentWriteResult[] } | (ContentWriteResult & { ok: false })>;
}
