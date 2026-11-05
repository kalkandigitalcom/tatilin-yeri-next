import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/* ===============================================================
   Faz 6 — DALGA 6: CACHE SİMETRİSİ VE GEÇERSİZ KILMA.
   A) Politika: her varlığın okuma tag'leri ↔ merkezi yazmanın düşürdüğü
      tag'ler eşleşir (kök neden düzeltmesi: tag'siz okuma kalmadı).
   B) Anahtar simetrisi: TR / EN / DE, ana dil ve aktif dil kümesi
      anahtarın parçası → eski dilin sonucu servis edilmez.
   C) Uçtan uca tag cache simülasyonu (gerçek okuma çekirdeği + Next
      `unstable_cache`/`revalidateTag` anlamı): kayıt → tag düşer → taze.
   D) Next.js sürümünde tag'lerin sayfaya (ISR girdisine) taşındığının
      kaynak kilidi + sunucu bağlantılarının kaynak kilitleri.
   =============================================================== */

import type { Locale } from "@/lib/i18n/config";
import { CONTENT_ENTITIES, type ContentEntityKey } from "@/lib/i18n/content/content-registry";
import {
  CONTENT_LEGACY_TAGS,
  contentCacheTags,
  contentWriteInvalidationTags,
  isPersistentlyCacheable,
} from "@/lib/i18n/content/content-cache-policy";
import { CONTENT_WRITE_MIGRATED } from "@/lib/i18n/content/content-write-modules";
import { createContentReadService, type ContentCacheAdapter } from "@/lib/i18n/content/content-read-core";
import type { ContentRepository } from "@/lib/i18n/content/content-repository";
import type { ContentLocaleContext } from "@/lib/i18n/content/content-locale-context";
import { contentCacheKey } from "@/lib/i18n/content/content-resolve";

const L: Locale[] = ["tr", "en", "de"];
const KEYS = CONTENT_ENTITIES.map((e) => e.key);

/* Next `unstable_cache` + `revalidateTag` anlamı: anahtar → JSON değer;
   tag → anahtarlar; revalidate(tag) o tag'li girdileri siler. */
class TagCache {
  store = new Map<string, string>();
  tags = new Map<string, Set<string>>();
  hits = 0;
  adapter: ContentCacheAdapter = async (key, tags, fn) => {
    if (this.store.has(key)) {
      this.hits++;
      return JSON.parse(this.store.get(key)!);
    }
    const v = await fn();
    this.store.set(key, JSON.stringify(v));
    for (const t of tags) (this.tags.get(t) ?? this.tags.set(t, new Set()).get(t)!).add(key);
    return v;
  };
  revalidate(tags: readonly string[]) {
    for (const t of tags) for (const k of this.tags.get(t) ?? []) this.store.delete(k);
  }
}

/** Bellek içi depo: varlık → kimlik → dil → alanlar ("yazma" = değiştirme). */
function memRepo(data: Record<string, Record<string, Partial<Record<Locale, Record<string, unknown>>>>>) {
  const calls = { fetchRows: 0 };
  const repo: ContentRepository = {
    async fetchRows(def, ids, locales = L) {
      calls.fetchRows++;
      const out = [];
      for (const id of ids)
        for (const [l, v] of Object.entries(data[def.key]?.[id] ?? {})) {
          if (!locales.includes(l as Locale) || !v) continue;
          const values: Record<string, unknown> = {};
          for (const f of def.fields) values[f.name] = (v as Record<string, unknown>)[f.name] ?? null;
          out.push({ parentId: id, locale: l as Locale, values, ...(def.slugKind ? { slug: null } : {}) });
        }
      return out;
    },
    async coverage() {
      return { total: 0, rows: 0, filled: {} };
    },
    async findParentIdsBySlug() {
      return [];
    },
  };
  return { repo, calls };
}
const ID = (key: string) => (key === "site_popup" ? "1" : "aaaaaaaa-6666-4666-8666-000000000001");
const firstField = (key: ContentEntityKey) => CONTENT_ENTITIES.find((e) => e.key === key)!.fields.find((f) => f.kind !== "jsonb")!.name;

describe("A) politika — okuma tag'leri ↔ yazma geçersiz kılma tag'leri", () => {
  it("14 varlığın hepsi merkezi yazmada ve hepsi kalıcı (tag'li) cache'leniyor — tag'siz okuma kalmadı", () => {
    expect(KEYS).toHaveLength(14);
    for (const k of KEYS) {
      expect(CONTENT_WRITE_MIGRATED.has(k), k).toBe(true);
      expect(isPersistentlyCacheable(k), k).toBe(true);
    }
  });

  it("her varlık: yazma tag'leri okuma tag'lerinin alt kümesi ve content:<varlık>'ı DAİMA içerir", () => {
    for (const k of KEYS) {
      const read = contentCacheTags(k);
      const write = contentWriteInvalidationTags([k]);
      expect(write, k).toContain(`content:${k}`);
      for (const t of write) expect(read, `${k}:${t}`).toContain(t);
      /* Eski yazma yollarının tag'leri de okumada → eski admin kaydı da düşürür. */
      for (const t of CONTENT_LEGACY_TAGS[k]) expect(read).toContain(t);
      /* "settings" yalnız settings yazımında düşer (routing cache'i boşa boşaltılmaz). */
      expect(write.includes("settings"), k).toBe(k === "settings");
    }
  });

  it("geri alma: modül merkezi yazmadan çıkarılırsa ve eski tag'i yoksa kalıcı cache'e ALINMAZ (eski kural)", async () => {
    vi.resetModules();
    vi.doMock("@/lib/i18n/content/content-write-modules", () => ({
      isContentWriteMigrated: (e: string) => e !== "page",
      CONTENT_WRITE_MIGRATED: new Set(),
    }));
    const p = await import("@/lib/i18n/content/content-cache-policy");
    expect(p.isPersistentlyCacheable("page")).toBe(false);
    expect(p.isPersistentlyCacheable("villa")).toBe(true);
    vi.doUnmock("@/lib/i18n/content/content-write-modules");
    vi.resetModules();
  });
});

describe("B) anahtar simetrisi", () => {
  it("istenen dil, ana dil, aktif diller, zincir ve kimlikler anahtarın parçası; aynı girdi → aynı anahtar", () => {
    const base = { op: "many", entity: "page", requested: "en" as Locale, chain: ["en", "tr"] as Locale[], root: "tr" as Locale, enabled: L, ids: ["a"] };
    const k = contentCacheKey(base);
    expect(contentCacheKey({ ...base })).toBe(k);
    const variants = [
      { requested: "de" as Locale },
      { requested: "tr" as Locale },
      { root: "en" as Locale },
      { enabled: ["tr", "en"] as Locale[] },
      { chain: ["en", "de", "tr"] as Locale[] },
      { ids: ["b"] },
    ];
    const all = new Set([k, ...variants.map((v) => contentCacheKey({ ...base, ...v }))]);
    expect(all.size).toBe(variants.length + 1);
  });
});

describe("C) uçtan uca — kayıt sonrası taze; ana dil / aktif dil değişiminde eski dil yok", () => {
  for (const key of KEYS) {
    it(`${key}: TR/EN/DE okuma cache'ten; merkezi yazma tag'leri düşünce yeni değer (diğer varlıklar etkilenmez)`, async () => {
      const f = firstField(key);
      const id = ID(key);
      const data = { [key]: { [id]: Object.fromEntries(L.map((l) => [l, { [f]: `${l} v1` }])) } } as never;
      const { repo, calls } = memRepo(data);
      const tc = new TagCache();
      let ctx: ContentLocaleContext = { root: "tr", enabled: L };
      const s = createContentReadService({ repository: repo, getLocaleContext: () => ctx, cache: tc.adapter });
      for (const l of L) expect((await s.getContent(key, id, l))?.values[f]).toBe(`${l} v1`);
      const n = calls.fetchRows;
      for (const l of L) await s.getContent(key, id, l);
      expect(calls.fetchRows).toBe(n); // cache'ten
      /* "Admin kaydı": EN değişir. Tag düşmeden önce eski (kanıt: cache gerçekten var). */
      (data as Record<string, Record<string, Record<string, Record<string, unknown>>>>)[key][id].en[f] = "en v2";
      expect((await s.getContent(key, id, "en"))?.values[f]).toBe("en v1");
      /* Merkezi yazmanın onCommitted tag'leri → taze; TR/DE de doğru. */
      tc.revalidate(contentWriteInvalidationTags([key]));
      expect((await s.getContent(key, id, "en"))?.values[f]).toBe("en v2");
      expect((await s.getContent(key, id, "tr"))?.values[f]).toBe("tr v1");
      expect((await s.getContent(key, id, "de"))?.values[f]).toBe("de v1");

      /* Ana dil değişimi: tag düşmese bile anahtar değişir → eski dilin
         zinciri servis edilmez. DE satırı silinir: DE isteği yeni ana dile düşer. */
      delete (data as Record<string, Record<string, Record<string, unknown>>>)[key][id].de;
      tc.revalidate(contentWriteInvalidationTags([key]));
      expect((await s.getContent(key, id, "de"))?.values[f]).toBe("tr v1");
      ctx = { root: "en", enabled: L };
      expect((await s.getContent(key, id, "de"))?.values[f]).toBe("en v2");
      /* Aktif dil değişimi: EN pasif → zincire girmez (yeni anahtar). */
      ctx = { root: "tr", enabled: ["tr", "de"] };
      expect((await s.getContent(key, id, "de"))?.values[f]).toBe("tr v1");
      const en = await s.getContent(key, id, "en");
      expect(en?.values[f]).toBe("tr v1");
    });
  }
});

describe("C2) geniş geçersiz kılma (bilinçli, güvenli yön)", () => {
  it("her merkezi yazma ortak 'content' tag'ini de düşürür → başka varlığın girdisi de tazelenir (eski veri riski yok)", async () => {
    const tc = new TagCache();
    const data = { faq: { [ID("faq")]: { tr: { question: "q1", answer: "a" } } } } as never;
    const s = createContentReadService({ repository: memRepo(data).repo, getLocaleContext: () => ({ root: "tr", enabled: L }), cache: tc.adapter });
    await s.getContent("faq", ID("faq"), "tr");
    expect(tc.store.size).toBe(1);
    tc.revalidate(contentWriteInvalidationTags(["menu"]));
    expect(tc.store.size).toBe(0);
    expect(contentWriteInvalidationTags(["menu"])).toContain("content");
  });
});

describe("D) kaynak kilitleri", () => {
  const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

  it("Next.js unstable_cache tag'leri sayfanın ISR girdisine taşınır (kurulu sürümde)", () => {
    const s = src("node_modules/next/dist/server/web/spec-extension/unstable-cache.js");
    /* Tag'ler çağıran render'ın (workUnitStore) tag listesine eklenir. */
    expect(s).toMatch(/workUnitStore\.tags/);
    expect(s).toMatch(/collectedTags/);
  });

  it("sunucu okuma: kalıcı cache içerik tag'leriyle; sunucu yazma: aynı saf tag kümesiyle revalidate", () => {
    expect(src("lib/i18n/content/content-read.server.ts")).toMatch(/unstable_cache\(fn, \[key\], \{ tags, revalidate/);
    const w = src("lib/i18n/content/content-write.server.ts");
    expect(w).toMatch(/for \(const tag of contentWriteInvalidationTags\(entities\)\)/);
    expect(w).toMatch(/revalidateTag\(tag, \{ expire: 0 \}\)/);
    expect(w).toMatch(/revalidateLocaleSlugs\(\)/);
  });

  it("sitemap okuyucusu tag'li cache kullanır (içerik kaydı sitemap'i de geçersiz kılar)", () => {
    const s = src("lib/i18n/content/public-seo-content.server.ts");
    expect(s).toMatch(/cache: \(key, tags, fn\) =>/);
    expect(s).toMatch(/unstable_cache\(fn, \["sitemap-content", key\], \{ tags/);
  });

  it("ana dil / aktif dil değişimi: settings + locale-slugs tag'leri, bütün public sayfalar, sitemap, robots ve proxy bağlamı", () => {
    const s = src("lib/i18n/routing/invalidate.server.ts");
    expect(s).toMatch(/\["settings", LOCALE_SLUGS_TAG\]/);
    expect(s).toMatch(/revalidatePath\("\/", "layout"\)/);
    expect(s).toMatch(/\["\/sitemap\.xml", "\/robots\.txt"\]/);
    expect(s).toMatch(/invalidateProxyRoutingContext\(\)/);
    for (const r of ["app/api/admin/settings/locales/route.ts", "app/api/admin/settings/root-locale/route.ts", "app/api/admin/settings/route.ts"]) {
      expect(src(r), r).toMatch(/invalidatePublicRoutingCaches\(\)/);
    }
  });

  it("popup cache anahtarı dil bağlamını içerir; tekil satırlar dil bağımsız ve içerik tag'li", () => {
    const p = src("lib/site-popup.cache.ts");
    expect(p).toMatch(/getCachedSitePopupForCtx\(ctx\.root, ctx\.enabled\.join\(","\)\)/);
    expect(p).toMatch(/SITE_POPUP_CACHE_TAG, \.\.\.contentCacheTags\("site_popup"\)/);
    const r = src("lib/i18n/content/public-shared-content.server.ts");
    expect(r).toMatch(/contentCacheTags\("settings"\), \.\.\.contentCacheTags\("site_popup"\)/);
  });

  it("merkezi yazmadan geçmeyen silmeler (blog, CMS sayfası) aynı içerik tag'lerini düşürür (sitemap + header/footer)", () => {
    const blog = src("app/api/admin/blog/[id]/route.ts");
    const del = blog.slice(blog.indexOf("export async function DELETE("));
    expect(del).toMatch(/invalidateContentEntity\("blog_post"\)/);
    const pages = src("app/api/admin/pages/route.ts");
    const pdel = pages.slice(pages.indexOf("export async function DELETE("));
    expect(pdel).toMatch(/invalidateContentEntity\("page"\)/);
    /* Yalnız BAŞARILI silmeden sonra (hata dalında çağrılmaz). */
    expect(pdel.indexOf("invalidateContentEntity")).toBeGreaterThan(pdel.indexOf("[admin.pages.delete] FAILED"));
    expect(src("lib/i18n/content/content-write.server.ts")).toMatch(/export function invalidateContentEntity[\s\S]*contentWriteInvalidationTags\(\[entity\]\)/);
  });

  it("blog yönetim API'si liste sayfasını BÜTÜN desteklenen dillerde yeniler (simetri)", () => {
    for (const f of ["app/api/admin/blog/route.ts", "app/api/admin/blog/[id]/route.ts"]) {
      const s = src(f);
      for (const l of L) expect(s, `${f}:${l}`).toContain(`revalidatePath("/${l}/blog")`);
    }
  });
});
