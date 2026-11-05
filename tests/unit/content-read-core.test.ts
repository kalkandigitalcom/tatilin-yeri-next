import { describe, expect, it, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import {
  CONTENT_ENTITIES,
  CONTENT_ENTITY_BY_KEY,
  type ContentEntityDef,
} from "@/lib/i18n/content/content-registry";
import type { ContentCoverage } from "@/lib/i18n/content/content-contract";
import type { ContentRepository } from "@/lib/i18n/content/content-repository";
import type { ContentRow } from "@/lib/i18n/content/content-resolve";
import {
  createContentReadService,
  type ContentCacheAdapter,
} from "@/lib/i18n/content/content-read-core";
import type { ContentLocaleContext } from "@/lib/i18n/content/content-locale-context";

/* Faz 3 — merkezi okuma çekirdeği: sahte repository ile davranış testleri. */

const V1 = "a0000000-0000-0000-0000-000000000001";
const V2 = "a0000000-0000-0000-0000-000000000002";
const V3 = "a0000000-0000-0000-0000-000000000003";

type Store = Record<string, ContentRow[]>; // table → rows

function row(parentId: string, locale: Locale, values: Record<string, unknown>, slug?: string | null): ContentRow {
  return { parentId, locale, values, ...(slug !== undefined ? { slug } : {}) };
}

function fakeRepo(store: Store) {
  const calls = { fetchRows: 0, coverage: 0, slug: 0, lastIds: [] as string[], lastLocales: [] as Locale[] };
  let fail = false;
  const repo: ContentRepository = {
    async fetchRows(def, ids, locales = ["tr", "en", "de"]) {
      calls.fetchRows++;
      calls.lastIds = [...ids];
      calls.lastLocales = [...locales];
      await new Promise((r) => setTimeout(r, 5));
      if (fail) throw new Error("db down");
      return (store[def.table] ?? [])
        .filter((r) => ids.includes(r.parentId) && locales.includes(r.locale))
        .map((r) => {
          const values: Record<string, unknown> = {};
          for (const f of def.fields) values[f.name] = r.values[f.name] ?? null;
          return def.slugKind ? { ...r, values, slug: r.slug ?? null } : { parentId: r.parentId, locale: r.locale, values };
        });
    },
    async coverage(def, locale): Promise<ContentCoverage> {
      calls.coverage++;
      const rows = (store[def.table] ?? []).filter((r) => r.locale === locale);
      const filled: Record<string, number> = {};
      for (const f of def.fields) {
        filled[f.name] = rows.filter((r) => {
          const v = r.values[f.name];
          return v != null && !(typeof v === "string" && v.trim() === "") && !(Array.isArray(v) && v.length === 0);
        }).length;
      }
      return { total: 3, rows: rows.length, filled };
    },
    async findParentIdsBySlug(def, slug, locale) {
      calls.slug++;
      return (store[def.table] ?? []).filter((r) => r.locale === locale && r.slug === slug).map((r) => r.parentId);
    },
  };
  return { repo, calls, setFail: (v: boolean) => (fail = v) };
}

const villaStore = (): Store => ({
  villa_translations: [
    row(V1, "tr", { description: "TR açıklama", badge: "Yeni", seo_title: "TR SEO", seo_description: "TR SEO D" }, "deniz-villa"),
    row(V1, "en", { description: "EN description", badge: "  ", seo_title: null, seo_description: "EN SEO D" }, "sea-villa"),
    row(V1, "de", { description: "DE Beschreibung", badge: "Neu", seo_title: "DE SEO", seo_description: "" }, "meer-villa"),
    row(V2, "tr", { description: "TR 2", badge: null, seo_title: null, seo_description: null }, "bos-villa"),
    row(V2, "de", { description: "DE 2", badge: null, seo_title: null, seo_description: null }, null),
    row(V3, "en", { description: "EN only 3", badge: null, seo_title: null, seo_description: null }, "only-en"),
  ],
  page_translations: [
    row("e0000000-0000-0000-0000-000000000001", "tr", { title: "Hakkımızda", sections: [{ type: "richtext", content: "<p>TR</p>" }] }, "hakkimizda"),
    row("e0000000-0000-0000-0000-000000000001", "en", { title: "About", sections: [] }, "about"),
  ],
  site_popup_translations: [
    row("1", "tr", { title: "Popup TR", stats: ["10 yıl"] }),
    row("1", "en", { title: "Popup EN", stats: [] }),
  ],
});

const ALL: ContentLocaleContext = { root: "tr", enabled: ["tr", "en", "de"] };

function svc(ctx: ContentLocaleContext | (() => ContentLocaleContext), store = villaStore(), cache?: ContentCacheAdapter) {
  const f = fakeRepo(store);
  const onError = vi.fn();
  const s = createContentReadService({
    repository: f.repo,
    getLocaleContext: typeof ctx === "function" ? ctx : () => ctx,
    cache,
    onError,
  });
  return { s, ...f, onError };
}

describe("Faz 3 — dil bazında okuma (TR / EN / DE ayrı ayrı)", () => {
  it("TR isteği TR satırından okur (TR özel durumu yok, ana tablo okunmaz)", async () => {
    const { s } = svc(ALL);
    const c = await s.getContent("villa", V1, "tr");
    expect(c?.values.description).toBe("TR açıklama");
    expect(c?.sourceLocale.description).toBe("tr");
    expect(c?.isFallback).toBe(false);
    expect(c?.slug).toBe("deniz-villa");
  });

  it("EN isteği: dolu alan EN, boş/NULL alan ana dilden (TR) — kısmi yedek noindex değil", async () => {
    const { s } = svc(ALL);
    const c = await s.getContent("villa", V1, "en");
    expect(c?.values.description).toBe("EN description");
    expect(c?.values.badge).toBe("Yeni"); // "  " boş sayılır
    expect(c?.sourceLocale.badge).toBe("tr");
    expect(c?.values.seo_title).toBe("TR SEO"); // NULL
    expect(c?.fallbackFields).toEqual(["badge", "seo_title"]);
    expect(c?.isFallback).toBe(false);
    expect(c?.slug).toBe("sea-villa");
  });

  it("DE isteği: boş string → yedek; DE slug", async () => {
    const { s } = svc(ALL);
    const c = await s.getContent("villa", V1, "de");
    expect(c?.values.description).toBe("DE Beschreibung");
    expect(c?.values.seo_description).toBe("TR SEO D");
    expect(c?.sourceLocale.seo_description).toBe("tr");
    expect(c?.slug).toBe("meer-villa");
  });
});

describe("Faz 3 — ana dil EN / TR / DE iken yedek zinciri", () => {
  it("ana dil TR: DE eksik → TR → EN", async () => {
    const { s } = svc({ root: "tr", enabled: ["tr", "en", "de"] });
    expect((await s.resolveChain("de")).chain).toEqual(["de", "tr", "en"]);
  });
  it("ana dil EN: DE eksik alan önce EN'den, sonra TR'den", async () => {
    const { s } = svc({ root: "en", enabled: ["en", "tr", "de"] });
    expect((await s.resolveChain("de")).chain).toEqual(["de", "en", "tr"]);
    const c = await s.getContent("villa", V1, "de");
    expect(c?.values.seo_description).toBe("EN SEO D");
    expect(c?.sourceLocale.seo_description).toBe("en");
  });
  it("ana dil DE: TR isteğinde eksik alan DE'den", async () => {
    const { s } = svc({ root: "de", enabled: ["de", "tr", "en"] });
    const c = await s.getContent("villa", V2, "tr");
    expect(c?.values.description).toBe("TR 2");
    const en = await s.getContent("villa", V2, "en");
    expect(en?.values.description).toBe("DE 2");
    expect(en?.sourceLocale.description).toBe("de");
    expect(en?.isFallback).toBe(true);
    expect(en?.slug).toBeNull(); // EN satırı yok → slug yedeğe düşmez
  });
  it("aynı dil iki kez zincire girmez; tek sorgu, her dil bir kez", async () => {
    const { s, calls } = svc({ root: "en", enabled: ["en", "tr", "de"] });
    expect((await s.resolveChain("en")).chain).toEqual(["en", "tr", "de"]);
    await s.getContent("villa", V1, "en");
    expect(calls.fetchRows).toBe(1);
    expect(new Set(calls.lastLocales).size).toBe(calls.lastLocales.length);
  });
});

describe("Faz 3 — eksik çeviri, pasif dil, NULL ve boş metin", () => {
  it("hiçbir aktif dilde satır yoksa null", async () => {
    const { s } = svc({ root: "tr", enabled: ["tr", "de"] });
    expect(await s.getContent("villa", V3, "tr")).toBeNull(); // yalnız EN satırı var, EN pasif
  });
  it("pasif dil (EN) yedek olarak KULLANILMAZ", async () => {
    const { s } = svc({ root: "de", enabled: ["de", "tr"] });
    const c = await s.getContent("villa", V1, "de");
    expect(c?.values.seo_description).toBe("TR SEO D");
    expect(Object.values(c!.sourceLocale)).not.toContain("en");
  });
  it("pasif dil istenirse ana dilden gösterilir, isFallback=true, slug null", async () => {
    const { s } = svc({ root: "tr", enabled: ["tr", "de"] });
    const c = await s.getContent("villa", V1, "en");
    expect(c?.values.description).toBe("TR açıklama");
    expect(c?.isFallback).toBe(true);
    expect(c?.slug).toBeNull();
    expect(c?.requestedLocale).toBe("en");
  });
  it("TR pasif + ana dil EN: TR satırı yedek olmaz", async () => {
    const { s } = svc({ root: "en", enabled: ["en"] });
    const c = await s.getContent("villa", V1, "en");
    expect(c?.values.badge).toBeNull();
    expect(c?.missing).toEqual(["badge", "seo_title"]);
  });
  it("her dilde boş alan → missing, değer null; jsonb boş dizi boş sayılır", async () => {
    const { s } = svc(ALL);
    const c = await s.getContent("villa", V2, "tr");
    expect(c?.missing).toEqual(["badge", "seo_title", "seo_description"]);
    expect(c?.values.badge).toBeNull();
    const p = await s.getContent("page", "e0000000-0000-0000-0000-000000000001", "en");
    expect(p?.values.sections).toEqual([{ type: "richtext", content: "<p>TR</p>" }]);
    expect(p?.sourceLocale.sections).toBe("tr");
    const pop = await s.getContent("site_popup", "1", "en");
    expect(pop?.values.title).toBe("Popup EN");
    expect(pop?.values.stats).toEqual(["10 yıl"]);
  });
  it("teknik alanlar values içine girmez; yalnız registry alanları", async () => {
    const store = villaStore();
    (store.villa_translations[0].values as Record<string, unknown>).id = "x";
    (store.villa_translations[0].values as Record<string, unknown>).updated_at = "now";
    const { s } = svc(ALL, store);
    const c = await s.getContent("villa", V1, "tr");
    expect(Object.keys(c!.values).sort()).toEqual(["badge", "description", "seo_description", "seo_title"]);
  });
  it("dolu metin kırpılmadan döner", async () => {
    const store = villaStore();
    store.villa_translations[0].values.description = "  boşluklu  ";
    const { s } = svc(ALL, store);
    expect((await s.getContent("villa", V1, "tr"))?.values.description).toBe("  boşluklu  ");
  });
});

describe("Faz 3 — çoklu kayıt ve kimlikler", () => {
  it("N kayıt TEK repository çağrısı (N+1 yok), kimlikler korunur", async () => {
    const { s, calls } = svc(ALL);
    const upper = V1.toUpperCase();
    const m = await s.getContentMany("villa", [upper, V2, V3, V2, "bozuk-id", "999"], "en");
    expect(calls.fetchRows).toBe(1);
    expect(calls.lastIds).toEqual([V1, V2, V3]);
    expect([...m.keys()].sort()).toEqual([V2, V3, upper].sort());
    expect(m.get(upper)?.values.description).toBe("EN description");
  });
  it("boş/geçersiz liste DB'ye gitmez", async () => {
    const { s, calls } = svc(ALL);
    expect((await s.getContentMany("villa", [], "tr")).size).toBe(0);
    expect((await s.getContentMany("villa", ["x", ""], "tr")).size).toBe(0);
    expect(calls.fetchRows).toBe(0);
  });
  it("smallint kimlik (site_popup) — '01' ve '1' aynı kanonik", async () => {
    const { s, calls } = svc(ALL);
    const m = await s.getContentMany("site_popup", ["1", "01", "40000"], "tr");
    expect(calls.lastIds).toEqual(["1"]);
    expect(m.get("1")?.values.title).toBe("Popup TR");
    expect(m.get("01")?.values.title).toBe("Popup TR");
  });
});

describe("Faz 3 — slug çözümleme", () => {
  it("dil bazlı slug → kimlik; yalnız aktif dil; format dışı sorgulanmaz", async () => {
    const { s, calls } = svc({ root: "tr", enabled: ["tr", "en"] });
    expect(await s.findIdBySlug("villa", "sea-villa", "en")).toBe(V1);
    expect(await s.findIdBySlug("villa", "sea-villa", "tr")).toBeNull();
    expect(await s.findIdBySlug("villa", "meer-villa", "de")).toBeNull(); // DE pasif
    const before = calls.slug;
    expect(await s.findIdBySlug("villa", "Sea_Villa", "en")).toBeNull();
    expect(await s.findIdBySlug("faq", "x", "en")).toBeNull(); // slug'sız varlık
    expect(calls.slug).toBe(before);
  });
  it("slugKind'siz varlıklarda slug alanı yok", async () => {
    const { s } = svc(ALL);
    const pop = await s.getContent("site_popup", "1", "tr");
    expect(pop && "slug" in pop).toBe(false);
  });
});

describe("Faz 3 — cache izolasyonu", () => {
  function memCache() {
    const store = new Map<string, string>();
    const tagsByKey = new Map<string, string[]>();
    const adapter: ContentCacheAdapter = async (key, tags, fn) => {
      if (store.has(key)) return JSON.parse(store.get(key)!);
      const v = await fn();
      store.set(key, JSON.stringify(v)); // unstable_cache gibi JSON
      tagsByKey.set(key, tags);
      return v;
    };
    return { adapter, store, tagsByKey };
  }

  it("anahtar dili içerir: EN ve DE sonuçları karışmaz", async () => {
    const mc = memCache();
    const { s, calls } = svc(ALL, villaStore(), mc.adapter);
    const en = await s.getContent("villa", V1, "en");
    const de = await s.getContent("villa", V1, "de");
    const en2 = await s.getContent("villa", V1, "en");
    expect(en?.values.description).toBe("EN description");
    expect(de?.values.description).toBe("DE Beschreibung");
    expect(en2).toEqual(en);
    expect(calls.fetchRows).toBe(2);
    expect([...mc.store.keys()].every((k) => k.includes("root=tr"))).toBe(true);
  });

  it("ana dil değişince eski dilin sonucu servis edilmez", async () => {
    const mc = memCache();
    let ctx: ContentLocaleContext = { root: "tr", enabled: ["tr", "en", "de"] };
    const { s } = svc(() => ctx, villaStore(), mc.adapter);
    const before = await s.getContent("villa", V1, "de");
    expect(before?.values.seo_description).toBe("TR SEO D");
    ctx = { root: "en", enabled: ["en", "tr", "de"] };
    const after = await s.getContent("villa", V1, "de");
    expect(after?.values.seo_description).toBe("EN SEO D");
    expect(mc.store.size).toBe(2);
  });

  it("aktif dil kümesi değişince de anahtar değişir", async () => {
    const mc = memCache();
    let ctx: ContentLocaleContext = { root: "tr", enabled: ["tr", "en", "de"] };
    const { s } = svc(() => ctx, villaStore(), mc.adapter);
    await s.getContent("villa", V1, "en");
    ctx = { root: "tr", enabled: ["tr", "de"] };
    const c = await s.getContent("villa", V1, "en");
    expect(c?.isFallback).toBe(true);
    expect(mc.store.size).toBe(2);
  });

  it("tag'ler: content, content:<varlık>, settings + eski yazma tag'leri", async () => {
    const mc = memCache();
    const { s } = svc(ALL, villaStore(), mc.adapter);
    await s.getContent("villa", V1, "tr");
    const tags = [...mc.tagsByKey.values()][0];
    expect(tags).toEqual(expect.arrayContaining(["content", "content:villa", "settings", "villas", "locale-slugs"]));
  });

  /* 🌐 Faz 6 Dalga 6 — kural güncellendi (kök neden: tag'siz okuma statik
     sayfaları içerik kaydında güncellenmez bırakıyordu). Eski yazma yolunda
     tag'i olmayan varlık, merkezi yazmaya geçtiyse (Faz 5: hepsi) kalıcı
     cache'lenir ve `content:<varlık>` tag'i taşır — merkezi yazma tam bu
     tag'i düşürür. Geri alma (modül merkezi yazmadan çıkarsa) eski kurala
     döner: aşağıdaki saf politika testi. */
  it("merkezi yazmaya geçmiş, eski tag'i olmayan varlık (page) kalıcı cache'lenir ve content:page tag'i taşır", async () => {
    const mc = memCache();
    const { s, calls } = svc(ALL, villaStore(), mc.adapter);
    await s.getContent("page", "e0000000-0000-0000-0000-000000000001", "tr");
    await s.getContent("page", "e0000000-0000-0000-0000-000000000001", "tr");
    expect(mc.store.size).toBe(1);
    expect(calls.fetchRows).toBe(1);
    expect([...mc.tagsByKey.values()][0]).toEqual(expect.arrayContaining(["content", "content:page", "settings"]));
  });

  it("DB hatası cache'e yazılmaz; null döner ve onError çağrılır", async () => {
    const mc = memCache();
    const { s, setFail, onError } = svc(ALL, villaStore(), mc.adapter);
    setFail(true);
    expect(await s.getContent("villa", V1, "tr")).toBeNull();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(mc.store.size).toBe(0);
    setFail(false);
    expect((await s.getContent("villa", V1, "tr"))?.values.description).toBe("TR açıklama");
  });
});

describe("Faz 3 — eşzamanlı okuma", () => {
  it("aynı anahtar için paralel istekler tek DB okuması paylaşır", async () => {
    const { s, calls } = svc(ALL);
    const rs = await Promise.all(Array.from({ length: 20 }, () => s.getContentMany("villa", [V1, V2], "en")));
    expect(calls.fetchRows).toBe(1);
    for (const r of rs) expect(r.get(V1)?.values.description).toBe("EN description");
  });
  it("farklı diller paralelde karışmaz", async () => {
    const { s } = svc(ALL);
    const locales: Locale[] = ["tr", "en", "de", "tr", "en", "de"];
    const rs = await Promise.all(locales.map((l) => s.getContent("villa", V1, l)));
    expect(rs.map((r) => r?.values.description)).toEqual([
      "TR açıklama", "EN description", "DE Beschreibung", "TR açıklama", "EN description", "DE Beschreibung",
    ]);
  });
  it("ana dil değişimi sırasında başlayan okumalar kendi bağlamıyla tutarlı", async () => {
    let ctx: ContentLocaleContext = { root: "tr", enabled: ["tr", "en", "de"] };
    const { s } = svc(() => ctx);
    const p1 = s.getContent("villa", V1, "de");
    ctx = { root: "en", enabled: ["en", "tr", "de"] };
    const p2 = s.getContent("villa", V1, "de");
    const [a, b] = await Promise.all([p1, p2]);
    expect(a?.sourceLocale.seo_description).toBe("tr");
    expect(b?.sourceLocale.seo_description).toBe("en");
  });
});

describe("Faz 3 — getCoverage / getAllLocales / opts.fallback", () => {
  it("getCoverage ham doluluk (yedek yok)", async () => {
    const { s } = svc(ALL);
    const c = await s.getCoverage("villa", "en");
    expect(c.rows).toBe(2);
    expect(c.filled.badge).toBe(0);
    expect(c.filled.description).toBe(2);
  });
  it("getCoverageReport 14 varlık × diller", async () => {
    const { s, calls } = svc(ALL);
    const r = await s.getCoverageReport(["tr", "en"]);
    expect(Object.keys(r).sort()).toEqual(CONTENT_ENTITIES.map((e) => e.key).sort());
    expect(calls.coverage).toBe(28);
  });
  it("getCoverage geçersiz dilde throw eder", async () => {
    const { s } = svc(ALL);
    await expect(s.getCoverage("villa", "fr" as Locale)).rejects.toThrow();
  });
  it("getAllLocales pasif diller dahil ham değerler + slug", async () => {
    const { s } = svc({ root: "tr", enabled: ["tr"] });
    const all = await s.getAllLocales("villa", V1);
    expect(Object.keys(all).sort()).toEqual(["de", "en", "tr"]);
    expect(all.en?.slug).toBe("sea-villa");
    expect(all.en?.badge).toBe("  ");
  });
  it("opts.fallback aktif dillerle kesişir, pasif dil eklenemez", async () => {
    const { s } = svc({ root: "tr", enabled: ["tr", "de"] });
    expect((await s.resolveChain("de", { fallback: ["de", "en", "de", "tr"] })).chain).toEqual(["de", "tr"]);
  });
});

describe("Faz 3 — 14 içerik türü", () => {
  it("her varlık için okuma çalışır (satır yoksa null, hata yok)", async () => {
    const { s, onError } = svc(ALL, {});
    for (const def of CONTENT_ENTITIES as readonly ContentEntityDef[]) {
      const id = def.parentIdType === "smallint" ? "1" : V1;
      expect(await s.getContent(def.key, id, "en")).toBeNull();
    }
    expect(onError).not.toHaveBeenCalled();
    expect(CONTENT_ENTITY_BY_KEY.site_popup.parentIdType).toBe("smallint");
  });
});
