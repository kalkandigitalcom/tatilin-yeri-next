import Header from "./Header";
/* 🔄 CACHE KULLANIMI — `getMenu()` / `getPublicSettings()` DOĞRUDAN
   çağrılıyordu; oysa `lib/cache.helpers.ts` bu iki okuma için ZATEN
   `unstable_cache` sarmalayıcıları barındırıyordu ve kimse
   kullanmıyordu. Header HER public sayfada render olduğu için bu,
   istek başına 5 gereksiz DB sorgusu demekti (settings 1 + getMenu
   içinde 4 paralel sorgu).

   Sarmalayıcılar BİREBİR aynı fonksiyonu çağırıyor:
     getCachedSettings = unstable_cache(() => getPublicSettings())
     getCachedMenu     = unstable_cache(() => getMenu())
   → dönen veri, tip, null/hata davranışı DEĞİŞMEZ. Yeni cache
   mekanizması KURULMADI; tag'ler ("settings" / "menu") ve
   revalidateSettings()/revalidateMenu() invalidation yolu AYNEN. */
import { getCachedMenu, getCachedSettings } from "@/lib/cache.helpers";
import { resolveAssetUrlVersioned } from "@/lib/storage.helpers";
/* 🛡️ PHASE 10H — dil etiketleri locale'den BAĞIMSIZ okunur, seçim client
   tarafta (`Header.tsx`, `usePathname()` locale'i) yapılır — bu wrapper
   `headers()`/`cookies()` KULLANMAMAYA devam eder. `getMenu()` /
   `lib/menu-resolver.ts` DEĞİŞTİRİLMEDİ: etiketler burada, çözülmüş
   ağaca `source_id` / `id` üzerinden eklenir. */
import { resolvePublicHome } from "@/lib/i18n/public-home";
/* 🌐 Faz 6 Dalga 4 — kategori / manuel menü / CMS sayfa etiketleri
   merkezi okuma servisinden: her AKTİF dil için (TR dahil) zincirle
   çözülmüş etiket haritası (dil başına TEK batch, N+1 yok). Seçim yine
   istemcide (`Header.tsx`, `resolveTaxonomyName`). Hiçbir aktif dilde
   etiketi olmayan düğüm GİZLENİR (ana tablo adına düşmez). */
import {
  loadLabelMapsByLocale,
  publicLocaleCtxFromSettings,
} from "@/lib/i18n/content/public-shared-content";
import { publicContentReader } from "@/lib/i18n/content/public-villa-content.server";
import type { TaxonomyNameByLocale } from "@/lib/i18n/taxonomy-name.helper";

/** `getMenu()` ağacının bu dosyada ihtiyaç duyulan minimum şekli. */
type MenuNodeLike = {
  /** 🛡️ MIGRATION 086 — `menu_translations` lookup anahtarı. */
  id?: string;
  source_type?: string;
  source_id?: string | null;
  children?: MenuNodeLike[];
  nameByLocale?: TaxonomyNameByLocale;
};

/** Ağaçtaki tüm `category` öğelerinin `source_id`'lerini toplar. */
function collectCategoryIds(nodes: MenuNodeLike[], out: string[]): void {
  for (const n of nodes) {
    if (n?.source_type === "category" && typeof n.source_id === "string") {
      out.push(n.source_id);
    }
    if (Array.isArray(n?.children) && n.children.length > 0) {
      collectCategoryIds(n.children, out);
    }
  }
}

/* 🛡️ MIGRATION 086 — YALNIZ `source_type === "manual"` satırların
   `menu.id`'leri. KAPSAM DARALTMASI (kullanıcı kararı):
     • manual   → adı `menu.name`; başka bir çeviri kaynağı YOK →
                  `menu_translations` BU satırlar için vardır.
     • page / page-auto → adı `pages.title`; çevirisi ZATEN
                  `page_translations` (Pages sistemi).
     • category → adı `villa_types.name`; çevirisi ZATEN
                  `villa_type_translations` (Phase 10H).
     • region   → adı `villa_locations.name`; Phase 10I gereği
                  ÇEVRİLMEZ (özel isim, canonical).
   Bu yüzden manual dışındaki hiçbir düğümün id'si `menu_translations`
   sorgusuna GİRMEZ — o kaynakların davranışı BİREBİR korunur. */
function collectManualMenuIds(nodes: MenuNodeLike[], out: string[]): void {
  for (const n of nodes) {
    if (n?.source_type === "manual" && typeof n.id === "string" && n.id) {
      out.push(n.id);
    }
    if (Array.isArray(n?.children) && n.children.length > 0) {
      collectManualMenuIds(n.children, out);
    }
  }
}

/* 🛡️ Ağaçtaki tüm `page` öğelerinin `source_id`'leri (= `pages.id`).
   ⚠️ ADMİN'DEKİ `page-auto` AYRIMI PUBLIC AĞAÇTA YOKTUR: hem admin'in
   menüye ELLE bağladığı CMS sayfaları (`resolveMenuRow`, menu-resolver
   .ts) hem de `show_in_menu=true` ile OTOMATİK dahil edilenler
   (`menu.service.ts`) ağaca `source_type: "page"` + `source_id =
   pages.id` olarak iner. `"page-auto"` yalnız `/maki-admin/menu`
   listesinin kendi UI `kind` değeridir. Bu yüzden TEK bir toplayıcı
   İKİSİNİ DE kapsar — ayrı kod yolu GEREKMEZ. */
function collectPageIds(nodes: MenuNodeLike[], out: string[]): void {
  for (const n of nodes) {
    if (n?.source_type === "page" && typeof n.source_id === "string") {
      out.push(n.source_id);
    }
    if (Array.isArray(n?.children) && n.children.length > 0) {
      collectPageIds(n.children, out);
    }
  }
}

/** Çeviri haritalarını ağaca uygular (yeni node'lar döner, mutasyon YOK).
 *
 *  🛡️ KAYNAK BAŞINA TEK ÇEVİRİ YOLU — source_type'a göre AYRIŞIR,
 *  iki kaynak ASLA aynı düğümde yarışmaz (öncelik/merge kuralı YOK):
 *    • `category` → `typeNamesById[source_id]` (Phase 10H,
 *      `villa_type_translations`) — MEVCUT DAVRANIŞ BİREBİR.
 *    • `manual`   → `menuNamesById[node.id]` (migration 086,
 *      `menu_translations`).
 *    • `page`     → `pageNamesById[source_id]` (`page_translations`
 *      .title; explicit + auto-include AYNI yoldan geçer).
 *    • `region`   → BURADA DOKUNULMAZ; Phase 10I: özel isim, canonical.
 *  Eşleşme yoksa `nameByLocale` undefined kalır → canonical TR `name`
 *  (`resolveTaxonomyName` fallback'i). */
function attachTypeNames<T extends MenuNodeLike>(
  nodes: T[],
  namesById: Record<string, TaxonomyNameByLocale>,
  menuNamesById: Record<string, TaxonomyNameByLocale> = {},
  pageNamesById: Record<string, TaxonomyNameByLocale> = {}
): T[] {
  return nodes.map((n) => {
    const children = Array.isArray(n?.children)
      ? attachTypeNames(n.children, namesById, menuNamesById, pageNamesById)
      : n?.children;

    let nameByLocale: TaxonomyNameByLocale | undefined;
    if (n?.source_type === "category" && typeof n.source_id === "string") {
      nameByLocale = namesById[n.source_id];
    } else if (n?.source_type === "manual" && typeof n.id === "string") {
      nameByLocale = menuNamesById[n.id];
    } else if (n?.source_type === "page" && typeof n.source_id === "string") {
      nameByLocale = pageNamesById[n.source_id];
    }

    if (!nameByLocale && children === n?.children) return n;
    return {
      ...n,
      ...(children === n?.children ? {} : { children }),
      ...(nameByLocale ? { nameByLocale } : {}),
    };
  });
}

/** 🌐 Faz 6 Dalga 4 — merkezi etiketlerle çevrilen düğüm türleri. */
function isCentralLabelled(n: MenuNodeLike): boolean {
  return (
    (n?.source_type === "category" && typeof n.source_id === "string") ||
    (n?.source_type === "manual" && typeof n.id === "string" && !!n.id) ||
    (n?.source_type === "page" && typeof n.source_id === "string")
  );
}

/** Etiketi hiçbir aktif dilde olmayan merkezi düğümü (alt ağacıyla) çıkarır;
 *  sıra korunur. Diğer düğüm türleri (bölge vb.) AYNEN kalır. */
function dropUnlabelled<T extends MenuNodeLike>(nodes: T[]): T[] {
  const out: T[] = [];
  for (const n of nodes) {
    if (isCentralLabelled(n) && !n.nameByLocale) continue;
    if (Array.isArray(n?.children) && n.children.length > 0) {
      const children = dropUnlabelled(n.children);
      out.push(children.length === n.children.length ? n : ({ ...n, children } as T));
    } else out.push(n);
  }
  return out;
}

export default async function HeaderWrapper() {
  /* ===============================================================
     🔥 SITE LOGO
     ===============================================================
     settings.site_logo varsa header'a aktarılır.
     Boş ise Header default text wordmark fallback gösterir.
     🛡️ Aşama A — resolveAssetUrl: FULL URL (legacy) pass-through;
        relative path (yeni) runtime'da getPublicUrl ile URL'e çevrilir.
     =============================================================== */
  let siteLogo: string | null = null;
  /* 🔄 TR ana sayfa yolu — varsayılan dil EN/DE iken "/" bir
     YÖNLENDİRİCİDİR ve TR ana sayfa "/tr"'de yaşar; logo linki oraya
     bakmalı ki TR kullanıcı varsayılan dile geri düşmesin. Okuma
     ZATEN yapılan `getPublicSettings()` üzerinden — EK FETCH YOK.
     Hata/kapalı/`tr` durumunda "/" kalır (BYTE-IDENTICAL). */
  let trHomeHref = "/";
  /* 🌐 Faz 6 Dalga 4 — dil bağlamı AYNI ayar okumasından (ek okuma yok);
     okunamazsa varsayılan bağlam (ana dil TR). */
  let enabled = publicLocaleCtxFromSettings(null).enabled;
  try {
    const settings = await getCachedSettings();
    enabled = publicLocaleCtxFromSettings(settings).enabled;
    siteLogo =
      resolveAssetUrlVersioned(settings?.site_logo, settings?.updated_at) ||
      null;
    trHomeHref = resolvePublicHome(settings).trHomeHref;
  } catch {
    siteLogo = null;
  }

  /* 🔥 güvenlik: menu okunamazsa boş array (ÖNCEKİ fallback davranışı).
     ⚠️ JSX try/catch DIŞINDA kurulur: React JSX'i anında render etmediği
     için try/catch render hatalarını ZATEN yakalamaz (bkz.
     react-hooks/error-boundaries). Veri hazırlığı try/catch içinde,
     tek `return` dışarıda — davranış BİREBİR aynı, lint uyarısı yok. */
  /* Tip `getCachedMenu`'den türetilir — sarmalayıcı `getMenu()`'yü
     aynen döndürdüğü için çıkarılan tip DEĞİŞMEZ. */
  let menuItems: Awaited<ReturnType<typeof getCachedMenu>> = [];
  try {
    menuItems = (await getCachedMenu()) || [];

    /* 🛡️ PHASE 10H — villa tipi adlarının EN/DE karşılıkları. Okuma fail
       olursa header ÇÖKMEZ: harita boş kalır → canonical TR adı gösterilir
       (mevcut davranış). */
    if (menuItems.length > 0) {
      const categoryIds: string[] = [];
      collectCategoryIds(menuItems as MenuNodeLike[], categoryIds);
      /* 🛡️ MIGRATION 086 — YALNIZ manual menü satırlarının id'leri. */
      const manualIds: string[] = [];
      collectManualMenuIds(menuItems as MenuNodeLike[], manualIds);
      /* 🛡️ CMS sayfa öğelerinin `pages.id`'leri (explicit + auto). */
      const pageIds: string[] = [];
      collectPageIds(menuItems as MenuNodeLike[], pageIds);
      /* 🌐 Faz 6 Dalga 4 — ÜÇ kaynak PARALEL, her biri aktif dil başına
         TEK batch. Çoklu dil kapalıyken yalnız ana dil okunur. Boş id
         listesinde sorgu HİÇ atılmaz. */
      const [namesById, menuNamesById, pageNamesById] = await Promise.all([
        loadLabelMapsByLocale(publicContentReader, "villa_type", "name", categoryIds, enabled),
        loadLabelMapsByLocale(publicContentReader, "menu", "name", manualIds, enabled),
        loadLabelMapsByLocale(publicContentReader, "page", "title", pageIds, enabled),
      ]);
      menuItems = dropUnlabelled(
        attachTypeNames(menuItems as MenuNodeLike[], namesById, menuNamesById, pageNamesById)
      ) as typeof menuItems;
    }
  } catch (err) {
    console.error("❌ HeaderWrapper menu error:", err);
    menuItems = [];
  }

  return <Header menu={menuItems} siteLogo={siteLogo} trHomeHref={trHomeHref} />;
}
