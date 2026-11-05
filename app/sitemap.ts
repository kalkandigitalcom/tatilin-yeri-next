import type { MetadataRoute } from "next";

/* 🛡️ EXIT HARDENING — sitemap'in inline `db.from()` çağrıları
   repository'ye taşındı (Katman A). Davranış AYNEN: villa
   (is_active=true & deleted_at IS NULL, slug+created_at) ve pages
   (is_active=true) aynı filtre + fail-soft. session-aware DB client
   artık gerekmez (RLS anon context repository `db` üzerinden aynen). */
/* 🛡️ Villa Migration S8H — listPublicSlugs native twin'e (S8G, byte-
   identical chunked-loop, unwrapped {slug,created_at}[]) repoint. sitemap
   server → server-only native repo import'u güvenli. villaRepository yalnız
   listPublicSlugs için; call-site aynı (villaAdminRepository → villaRepository alias). */
import { villaAdminRepository as villaRepository } from "@/lib/db/villa.repository.server";
import { pagesRepository } from "@/lib/db/pages.repository";
/* 🛡️ Blog (FAZ 3) — yayında olan blog yazıları sitemap'e dahil. */
import { blogRepository } from "@/lib/db/blog.repository";
/* 🛡️ PHASE 7D — yalnız villa entry'lerine locale hreflang alternates
   eklemek için. Mevcut cache/settings altyapısı REUSE edilir (yeni
   bir cache sistemi YOK); Phase 7B'nin `buildLocaleAlternates`'i TEK
   URL kaynağı (elle string birleştirme YOK). */
import { getCachedSettings } from "@/lib/cache.helpers";
/* 🛡️ SEO landing — kategori + bölge GRUBU kökü giriş sayfaları. */
import { getTaxonomyLandingSitemapPaths } from "@/lib/taxonomy-landing.server";
import { getEnabledPublicLocales, type Locale } from "@/lib/i18n/config";
import { primeRoutingContext } from "@/lib/i18n/routing/context.server";
import { loadNoindexSlugs, loadSitemapIds } from "@/lib/i18n/sitemap-data.server";
/* 🌐 Faz 6 Dalga 5 — dil kararları sayfa metadata'sıyla AYNI saf kuraldan
   (merkezi içerik servisi; pasif dil hiçbir adımda yok). */
import {
  categoryIndexableLocales,
  loadContentsByLocale,
  textIndexableLocales,
  villaIndexableLocales,
} from "@/lib/i18n/content/public-seo-content";
import { createSitemapContentReader } from "@/lib/i18n/content/public-seo-content.server";
import { contentLocaleContextFromSettings } from "@/lib/i18n/content/content-locale-context";
import { siteIndexingEnabled } from "@/lib/seo-site-policy";
import { shortGapsRepository } from "@/lib/db/short-gaps.repository";
import { shortGapSitemapPaths } from "@/lib/short-gaps.helpers";
import { shortGapsSeoLocales } from "@/app/components/short-gaps/short-gaps-metadata";
import { localizeHref } from "@/lib/i18n/routing/url";

/* ===============================================================
   🛡️ SITEMAP — Next.js App Router (production-grade, dynamic)
   ===============================================================
   GERÇEK PUBLIC URL MİMARİSİ (analiz sonucu):
     INDEXLENEN:
       /                       (anasayfa)
       /kiralik-villalar       (villa listesi)
       /iletisim               (statik)
       /teklif-al              (lead-gen landing)
       /kiralik-villa/[slug]   (DYNAMIC — aktif villalar)
       /p/[slug]               (DYNAMIC — aktif CMS sayfaları)
     HARİÇ (sitemap'e ASLA girmez):
       /arama                  (query-based, force-dynamic, duplicate)
       /favoriler              (kullanıcı state)
       /favoriler/paylas/[token], /liste/[token], /v/[token]  (token, per-user)
       /rezervasyon/[slug]     (transactional, villa detay duplicate'i)
       /maki-admin/*, /api/*   ((public) dışı — zaten kapsam dışı)

   VERİ KAYNAKLARI (public-read, anon server-side OK — sitemap public
   görünürlüğü yansıtmalı; RLS ile gizli satır sitemap'e GİRMEZ):
     - villa  : slug + created_at, is_active=true & deleted_at IS NULL
     - pages  : slug + created_at, is_active=true
   Minimal projeksiyon (slug, created_at) → 1000+ villa'da hafif sorgu.

   ⚠️ NOT — `updated_at` schema'da YOK (sadece `created_at` mevcut).
   Eski sitemap implementasyonu `updated_at` istiyordu, runtime error
   veriyordu ("column ... does not exist"). `created_at` ile
   değiştirildi — lastModified semantiği "kayıt yaratıldığı an" oldu
   (Google bunu yine kabul eder; gerçek update timestamp ileride
   trigger ile eklenebilir).

   ⚠️ ÖN KOŞUL — ABSOLUTE URL:
     Sitemap spec absolute URL ister. SITE_URL boşsa URL'ler relative
     kalır → geçersiz sitemap. NEXT_PUBLIC_SITE_URL prod'da SET
     EDİLMELİ. StructuredData ile aynı kaynak.

   SCALING:
     - Tek sitemap.ts → 50.000 URL / 50MB limitine kadar (1000+ villa
       rahatça kapsanır). 50k+ için Next `generateSitemaps()` ile
       sitemap-index'e geçilir (gelecek; yorum altta).

   CACHE: ISR — `revalidate = 3600` (saatlik). Villa/sayfa CRUD sonrası
     en geç 1 saatte yansır; istenirse `revalidatePath("/sitemap.xml")`
     ile anında invalidate edilebilir (gelecek hook).
   =============================================================== */

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  ""
).replace(/\/+$/, "");

/* ISR: saatlik yeniden üretim. Sitemap her istekte DB'ye gitmez;
   pencere içinde cache'ten servis edilir → cache-friendly + ölçeklenir. */
export const revalidate = 3600;

function url(path: string): string {
  if (!SITE_URL) {
    /* Prod'da olmamalı; build/preview'de relative kalmasın diye uyarı. */
    console.warn(
      "[sitemap] NEXT_PUBLIC_SITE_URL tanımsız — sitemap URL'leri relative; prod'da SET EDİLMELİ."
    );
  }
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_URL}${p}`;
}

function toDate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/* 🛡️ PHASE 7D — YALNIZ villa detay entry'leri için hreflang alternates.
   EN/DE için AYRI bir sitemap URL entry'si BİLİNÇLİ OLARAK EKLENMİYOR
   (bkz. dosya başındaki Phase 7D notu / Phase 7A audit §12): EN/DE
   villa detay sayfaları bugün — `multilingual_enabled` ne olursa
   olsun — hâlâ `robots:{index:false,follow:false}` VE ComingSoon
   placeholder (Phase 6B/7C, robots'un flag'e bağlanması AYRI bir faz,
   Phase 7E). Bir sitemap'e noindex sayfa URL'i EKLEMEK Google'ın
   kendi rehberliğine göre yanlış sinyal (Search Console'da "Excluded
   by noindex tag" + hreflang/sitemap mismatch riski). Bunun yerine
   yalnızca TR entry'sinin `alternates.languages`'ı dolduruluyor —
   TR'nin KENDİ `url` alanı DEĞİŞMİYOR, yalnız ek bir hreflang-ilişki
   alanı EKLENİYOR. Path'ler Phase 7B'nin `buildLocaleAlternates`'inden
   (tek kaynak); absolute'a bu dosyanın MEVCUT `url()` helper'ıyla
   çözülüyor (yeni bir absolute-URL mekanizması İCAT EDİLMEDİ). */
/* 🌐 Çok Dilli Mimari Faz 1 — kapalı diller sitemap hreflang'inde
   GÖRÜNMEZ (`filterLocaleLanguages`; aktif dil listesi
   `getEnabledPublicLocales` — tek kaynak). */
/* ===============================================================
   🌐 ÇOK DİLLİ SITEMAP — Faz 3
   ===============================================================
   Her içerik için, AKTİF ve içeriğin GERÇEKTEN mevcut olduğu her dilde
   AYRI bir <url> girdisi üretilir:
     • loc        → o dilin kanonik URL'si (merkezi route sistemi:
                    ana dil öneksiz, diğerleri önekli, dil segmentleri ve
                    dil slug'ları). Proxy ve sayfa canonical'ı ile AYNI.
     • alternates → aynı içeriğin diğer dillerdeki URL'leri + x-default
                    (ana dil; ana dilde yoksa taban TR). ≥2 dil yoksa
                    alan eklenmez.
   GİRMEYENLER: kapalı diller, noindex kayıtlar, pasif/silinmiş kayıtlar,
   çevirisi olmayan blog/CMS dilleri, 0 villalı kategori/bölge, robots
   ile kapatılan sayfalar (arama, favoriler, rezervasyon, token linkleri),
   yönlendiren URL'ler (yalnız kanonik URL'ler üretildiği için).
   Aynı loc iki kez yazılmaz (Set).
   =============================================================== */
type Freq = NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;

function localizedEntries(
  trPath: string,
  locales: readonly Locale[],
  root: Locale,
  meta: { lastModified?: Date; changeFrequency: Freq; priority: number },
  seen: Set<string>
): MetadataRoute.Sitemap {
  if (locales.length === 0) return [];
  const urls = Object.fromEntries(
    locales.map((l) => [l, url(localizeHref(trPath, l))])
  ) as Record<string, string>;
  const xDefault = locales.includes(root) ? root : locales[0];
  const languages =
    locales.length >= 2 ? { ...urls, "x-default": urls[xDefault] } : undefined;
  const out: MetadataRoute.Sitemap = [];
  for (const l of locales) {
    const loc = urls[l];
    if (seen.has(loc)) continue;
    seen.add(loc);
    out.push({
      url: loc,
      ...(meta.lastModified ? { lastModified: meta.lastModified } : {}),
      changeFrequency: meta.changeFrequency,
      priority: meta.priority,
      ...(languages ? { alternates: { languages } } : {}),
    });
  }
  return out;
}

type SlugRow = { slug: string | null; created_at: string | null };

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const settings = await getCachedSettings().catch(() => null);
  /* 🌐 Faz 6 Dalga 5 — site geneli indeksleme KAPALI → her sayfa noindex
     (kök layout + dispatcher politikası) → sitemap HİÇ URL sunmaz. */
  if (!siteIndexingEnabled(settings)) return [];
  const ctx = await primeRoutingContext();
  const enabled = getEnabledPublicLocales(settings);
  const root = ctx.root;
  const now = new Date();
  const seen = new Set<string>();

  const [noindex, ids] = await Promise.all([loadNoindexSlugs(), loadSitemapIds()]);
  /* 🌐 Faz 6 Dalga 5 — merkezi okuyucu (hata görünür). Okuma hatasında
     bozulma modu: villa / kategori bütün aktif dillerde (kayıt var; eski
     davranış), blog / CMS yalnız ana dilde (eski "yalnız taban dil"
     bozulmasının simetrik karşılığı). */
  const { reader, failed } = createSitemapContentReader(settings);
  const contentRoot = contentLocaleContextFromSettings(settings).root;
  const entries: MetadataRoute.Sitemap = [];

  /* ---------- statik sayfalar (her aktif dilde) ---------- */
  entries.push(
    ...localizedEntries("/", enabled, root, { lastModified: now, changeFrequency: "daily", priority: 1.0 }, seen),
    ...localizedEntries("/kiralik-villalar", enabled, root, { lastModified: now, changeFrequency: "daily", priority: 0.9 }, seen),
    ...localizedEntries("/iletisim", enabled, root, { lastModified: now, changeFrequency: "monthly", priority: 0.5 }, seen),
    ...localizedEntries("/teklif-al", enabled, root, { lastModified: now, changeFrequency: "monthly", priority: 0.5 }, seen)
  );

  /* ---------- kategori + bölge açılış sayfaları (≥1 aktif villa) ---------- */
  try {
    const { categories, regions, categoryIds } = await getTaxonomyLandingSitemapPaths();
    /* Kategori: ad hiçbir aktif dilde yoksa sayfa noindex,follow → yok.
       Ad dilden bağımsız (zincir) → ana dilde TEK batch yeterli. */
    const typeContents = await loadContentsByLocale(reader, "villa_type", [...categoryIds.values()], [contentRoot]);
    const categoryLocales = (path: string): Locale[] => {
      if (failed.has("villa_type")) return enabled;
      const id = categoryIds.get(path);
      const c = id ? typeContents.get(id)?.[contentRoot] : undefined;
      const named = typeof c?.values?.name === "string" && c.values.name.trim() !== "";
      /* Villa sayısı ≥1 zaten getTaxonomyLandingSitemapPaths'te süzüldü. */
      return categoryIndexableLocales(named, 1, enabled);
    };
    for (const path of categories) {
      entries.push(
        ...localizedEntries(path, categoryLocales(path), root, { lastModified: now, changeFrequency: "daily", priority: 0.8 }, seen)
      );
    }
    for (const path of regions) {
      entries.push(
        ...localizedEntries(path, enabled, root, { lastModified: now, changeFrequency: "daily", priority: 0.8 }, seen)
      );
    }
  } catch (err) {
    console.error("[sitemap] taxonomy landing EXCEPTION:", err instanceof Error ? err.message : err);
  }

  /* ---------- villalar (aktif, silinmemiş, noindex değil) ---------- */
  try {
    const data = await villaRepository.listPublicSlugs();
    const rows = ((data as SlugRow[] | null) || []).filter((v) => v.slug && !noindex.villa.has(v.slug));
    /* Villa: hiçbir aktif dilde içerik yoksa noindex,follow → yok; yedek
       dilden içerik varsa indexlenir (onaylı karar) → bütün aktif diller. */
    const villaIds = rows.map((v) => ids.villa?.get(v.slug!)).filter((x): x is string => !!x);
    const villaContents = await loadContentsByLocale(reader, "villa", villaIds, [contentRoot]);
    for (const v of rows) {
      const id = ids.villa?.get(v.slug!);
      const locales =
        !ids.villa || !id || failed.has("villa")
          ? enabled
          : villaIndexableLocales(villaContents.get(id)?.[contentRoot], false, enabled);
      entries.push(
        ...localizedEntries(`/kiralik-villa/${v.slug}`, locales, root, {
          lastModified: toDate(v.created_at),
          changeFrequency: "weekly",
          priority: 0.8,
        }, seen)
      );
    }
  } catch (err) {
    console.error("[sitemap] villa fetch EXCEPTION:", err instanceof Error ? err.message : err);
  }

  /* ---------- CMS sayfaları (aktif, noindex değil, çevrilmiş diller) ---------- */
  try {
    const { data, error } = await pagesRepository.findActivePages();
    if (error) {
      console.error("[sitemap] pages fetch error:", error.message);
    } else {
      type PageRow = SlugRow & { id?: string | null };
      const pages = ((data as PageRow[] | null) || []).filter((p) => p.slug && !noindex.page.has(p.slug));
      const pageContents = await loadContentsByLocale(
        reader,
        "page",
        pages.map((p) => String(p.id ?? "").toLowerCase()),
        enabled
      );
      for (const p of pages) {
        const locales =
          failed.has("page") || !p.id
            ? enabled.filter((l) => l === contentRoot)
            : textIndexableLocales("page", false, pageContents.get(String(p.id).toLowerCase()) ?? {}, enabled);
        entries.push(
          ...localizedEntries(`/p/${p.slug}`, locales, root, {
            lastModified: toDate(p.created_at),
            changeFrequency: "monthly",
            priority: 0.6,
          }, seen)
        );
      }
    }
  } catch (err) {
    console.error("[sitemap] pages fetch EXCEPTION:", err instanceof Error ? err.message : err);
  }

  /* ---------- kısa süreli fırsatlar (🌐 Faz 6 Dalga 5) ----------
     Ana sayfa bölümüyle AYNI kaynak (get_short_gap_counts); yalnız villası
     olan ay + gece; dil = sayfa metadata'sının ortak kararı. Fail-soft. */
  try {
    const { data, error } = await shortGapsRepository.getShortGapCounts();
    if (error) {
      console.error("[sitemap] short gaps fetch error:", error.message);
    } else {
      const rows = (Array.isArray(data) ? data : []) as Array<{ bucket_month: unknown; gap_nights: unknown; villa_count: unknown }>;
      for (const path of shortGapSitemapPaths(rows)) {
        const [, , ay, gece] = path.split("/");
        entries.push(
          ...localizedEntries(path, shortGapsSeoLocales(ay, gece, enabled), root, {
            lastModified: now,
            changeFrequency: "daily",
            priority: 0.6,
          }, seen)
        );
      }
    }
  } catch (err) {
    console.error("[sitemap] short gaps EXCEPTION:", err instanceof Error ? err.message : err);
  }

  /* ---------- blog dizini + yazılar ---------- */
  entries.push(
    ...localizedEntries("/blog", enabled, root, { lastModified: now, changeFrequency: "daily", priority: 0.7 }, seen)
  );
  try {
    const { data, error } = await blogRepository.findActiveSlugs();
    if (error) {
      console.error("[sitemap] blog fetch error:", error.message);
    } else {
      type BlogRow = { slug: string | null; published_at: string | null; updated_at: string | null };
      const posts = ((data as BlogRow[] | null) || []).filter((b) => b.slug && !noindex.blog.has(b.slug));
      const blogIds = posts.map((b) => ids.blog?.get(b.slug!)).filter((x): x is string => !!x);
      const blogContents = await loadContentsByLocale(reader, "blog_post", blogIds, enabled);
      for (const b of posts) {
        const id = ids.blog?.get(b.slug!);
        const locales =
          !ids.blog || !id || failed.has("blog_post")
            ? enabled.filter((l) => l === contentRoot)
            : textIndexableLocales("blog_post", false, blogContents.get(id) ?? {}, enabled);
        entries.push(
          ...localizedEntries(`/blog/${b.slug}`, locales, root, {
            lastModified: toDate(b.updated_at || b.published_at),
            changeFrequency: "weekly",
            priority: 0.7,
          }, seen)
        );
      }
    }
  } catch (err) {
    console.error("[sitemap] blog fetch EXCEPTION:", err instanceof Error ? err.message : err);
  }

  return entries;
}

/* ===============================================================
   🔭 GELECEK — 50.000+ URL (sitemap index)
   ===============================================================
   Villa sayısı 50k'yı aşarsa Next.js `generateSitemaps()` ile
   chunk'lara böl (her chunk ≤ 50k URL); Next otomatik sitemap-index
   üretir:
     export async function generateSitemaps() {
       // toplam villa / 45000 → [{id:0},{id:1},...]
     }
     export default async function sitemap({ id }: { id: number }) {
       // id*45000 .. (id+1)*45000 arası villa slice
     }
   Şu anki tek-dosya yaklaşımı 1000+ villa için fazlasıyla yeterli.
   =============================================================== */
