import type { Metadata } from "next";

/* ===============================================================
   🌐 SİTE GENELİ İNDEKSLEME POLİTİKASI — Faz 6 Dalga 5 (SAF)
   ===============================================================
   Admin'deki site geneli ayar (`settings.robots_index` /
   `robots_follow`) kök layout'ta `robots` olarak basılır. Ancak bir
   sayfa kendi `robots` alanını verdiğinde (ör. CMS `index,follow`,
   teklif sayfası `index,follow`) Next.js kök layout değerini EZER →
   "indeksleme kapalı" iken bazı sayfalar `index` diyordu. Bu dosya
   politikayı TEK yerde uygular (dil dispatcher'ı ve sitemap):
     • indeksleme AÇIK → sayfanın kararı AYNEN.
     • indeksleme KAPALI → her sayfada `index:false` (sayfanın `follow`
       kararı korunur; sayfa robots vermemişse kök layout zaten
       noindex basar → dokunulmaz); sitemap HİÇ URL sunmaz.
   ⚠️ robots.txt ile KARIŞTIRILMAZ: robots.txt tarama (crawl) kuralıdır;
   `Disallow: /` eklemek tarayıcının sayfadaki `noindex`'i GÖRMESİNİ
   engeller (URL dış linklerle yine indekste kalabilir). Bu yüzden
   indeksleme kapalıyken robots.txt kuralları DEĞİŞTİRİLMEZ.
   =============================================================== */

type SiteRobotsSettings = { robots_index?: boolean | null; robots_follow?: boolean | null } | null | undefined;

export function siteIndexingEnabled(settings: SiteRobotsSettings): boolean {
  return settings?.robots_index !== false;
}

export function applySiteIndexingPolicy(meta: Metadata, settings: SiteRobotsSettings): Metadata {
  if (siteIndexingEnabled(settings)) return meta;
  const r = meta.robots;
  if (r === undefined || r === null) return meta;
  if (typeof r === "string") {
    return /\bnoindex\b/i.test(r) ? meta : { ...meta, robots: { index: false, follow: !/\bnofollow\b/i.test(r) } };
  }
  if (r.index === false) return meta;
  return { ...meta, robots: { ...r, index: false } };
}
