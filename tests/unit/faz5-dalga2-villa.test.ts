import { beforeEach, describe, expect, it, vi } from "vitest";

/* ===============================================================
   Faz 5 — DALGA 2 — VİLLA admin → merkezi içerik yazma
   (oluşturma / güncelleme / kopyalama / çeviri kartı / ana dil slug'ı)
   Fiyat, mesafe ve ilişki servisleri mock: çağrılma sırası/argümanı
   değişmeden kalmalı (fiyat/rezervasyon koduna dokunulmadı).
   =============================================================== */

const VID = "a1000000-0000-0000-0000-000000000001";
const SRC = "a2000000-0000-0000-0000-000000000002";

const h = vi.hoisted(() => ({
  settings: { multilingual_enabled: true, public_default_locale: "tr", public_locales: null } as Record<string, unknown>,
  rows: [] as Array<{ parentId: string; locale: string; values: Record<string, unknown>; slug?: string | null }>,
  manyCalls: [] as unknown[][],
  saveCalls: [] as unknown[][],
  createCalls: [] as unknown[][],
  createResult: { ok: true, id: "new-villa", results: [] } as Record<string, unknown>,
  saveResult: { ok: true, created: false, target: "translation", mode: "base", written: ["slug"], slug: "kas-villa" } as Record<string, unknown>,
  audit: [] as Record<string, unknown>[],
  legacy: { insertVilla: vi.fn(), updateVillaById: vi.fn() },
  slugCalls: [] as unknown[][],
  order: [] as string[],
  sourceRow: {
    id: "a2000000-0000-0000-0000-000000000002",
    title: "Villa Deniz",
    slug: "villa-deniz",
    description: "TR açıklama",
    badge: "Yeni",
    guests: 6,
    bedroom_layout: [{ type: "double", count: 1 }],
    is_active: true,
    search_title: "villa deniz",
    created_at: "2026-01-01",
  } as Record<string, unknown>,
}));

vi.mock("@/lib/cache.helpers", () => ({ getCachedSettings: async () => h.settings }));
vi.mock("@/lib/db/pg.client", () => ({
  getPgPool: () => ({
    query: async (text: string, values: unknown[]) => {
      if (text.includes("_translations\" WHERE")) {
        const ids = ((values[0] as unknown[]) ?? []).map(String);
        return {
          rows: h.rows
            .filter((r) => ids.includes(r.parentId))
            .map((r) => ({ parent_id: r.parentId, locale: r.locale, ...r.values, slug: r.slug ?? null })),
        };
      }
      if (text.includes("to_regprocedure")) return { rows: [{ ok: true }] };
      if (text.startsWith("SELECT slug FROM public.")) return { rows: [{ slug: "villa-deniz" }] };
      return { rows: [] };
    },
  }),
}));
vi.mock("@/lib/i18n/content/content-write.server", () => ({
  saveContent: async (...a: unknown[]) => {
    h.saveCalls.push(a);
    return h.saveResult;
  },
  saveContentMany: async (...a: unknown[]) => {
    h.order.push("core");
    h.manyCalls.push(a);
    return { ok: true, results: [] };
  },
  createContent: async (...a: unknown[]) => {
    h.order.push("core");
    h.createCalls.push(a);
    return h.createResult;
  },
}));
vi.mock("@/lib/db/admin-activity-log.repository.server", () => ({
  adminActivityLogRepository: { insert: async (r: Record<string, unknown>) => (h.audit.push(r), { error: null }) },
}));
vi.mock("@/lib/db/villa.repository.server", () => ({
  villaAdminRepository: {
    insertVilla: (...a: unknown[]) => h.legacy.insertVilla(...a),
    updateVillaById: (...a: unknown[]) => h.legacy.updateVillaById(...a),
    findRawById: async () => ({ data: h.sourceRow, error: null }),
    findTypeRelationIds: async () => ({ data: [{ type_id: "t1" }], error: null }),
    findFeatureRelationIds: async () => ({ data: [], error: null }),
    findRuleRelationIds: async () => ({ data: [], error: null }),
    findPriceIncludeRelationIds: async () => ({ data: [], error: null }),
    findPricesForClone: async () => ({ data: [{ start_date: "2026-06-01", end_date: "2026-06-30", price: 100, currency: "EUR" }], error: null }),
    findDistancesForClone: async () => ({ data: [], error: null }),
  },
}));
vi.mock("@/app/services/villa-admin/_helpers/slug", () => ({
  generateUniqueSlug: async (...a: unknown[]) => {
    h.slugCalls.push(a);
    return "villa-deniz-2";
  },
}));
vi.mock("@/app/services/villa-admin/_helpers/relations", () => {
  const rec = (n: string) => async () => void h.order.push(n);
  return {
    insertVillaTypeRelations: rec("types"),
    insertVillaFeatureRelations: rec("features"),
    insertVillaRuleRelations: rec("rules"),
    insertVillaPriceIncludeRelations: rec("includes"),
    replaceVillaTypeRelations: rec("types"),
    replaceVillaFeatureRelations: rec("features"),
    replaceVillaRuleRelations: rec("rules"),
    replaceVillaPriceIncludeRelations: rec("includes"),
  };
});
const prices = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/app/services/villa-price.service.server", () => ({
  setVillaPricesServer: (...a: unknown[]) => (h.order.push("prices"), prices(...(a as []))),
}));
vi.mock("@/app/services/villa-distance.service.server", () => ({
  setVillaDistancesServer: async () => void h.order.push("distances"),
}));

import { createVillaFull } from "@/app/services/villa-admin/create.service";
import { updateVillaFull } from "@/app/services/villa-admin/update.service";
import { cloneVilla } from "@/app/services/villa-admin/clone.service";
import {
  overlayVillaRoot,
  saveVillaRootSlugCentral,
  saveVillaTranslationCentral,
  splitVillaCore,
} from "@/app/services/villa-admin/_helpers/content.server";
import { upsertVillaTranslation } from "@/app/services/villa-translation.service";
import { CONTENT_WRITE_MIGRATED, LEGACY_WRITE_DISABLED_MESSAGE } from "@/lib/i18n/content/content-write-modules";

const CALLER = { id: "admin-1", email: "a@x", authUserId: "u", is_active: true };
const setRoot = (r: "tr" | "en" | "de") => {
  h.settings = { multilingual_enabled: true, public_default_locale: r, public_locales: null };
};
type CreateArg = { entity: string; technical: Record<string, unknown>; locales: Array<{ locale: string; patch: Record<string, unknown> }> };
type ManyArgs = [Array<Record<string, unknown>>, unknown, { technical?: Array<{ values: Record<string, unknown>; jsonColumns?: string[] }> }];

const FORM = {
  title: "Villa Deniz",
  description: '<p>Deniz</p><script>x()</script>',
  badge: "Popüler",
  guests: 6,
  bedrooms: 3,
  bathrooms: 2,
  seo_title: "SEO",
  seo_description: "",
  noindex: false,
  pool_heating_months: [7, 6, 7],
};
const BASE_PAYLOAD = {
  form: FORM,
  selectedLocation: "loc-1",
  selectedTypes: ["t1"],
  selectedFeatures: [],
  mapData: { map_type: "coords", latitude: 36.1, longitude: 29.4 },
  distances: [],
  prices: [{ start_date: "2026-06-01", end_date: "2026-06-30", price: 100, currency: "EUR" }],
};

beforeEach(() => {
  setRoot("tr");
  h.rows = [];
  h.manyCalls = [];
  h.saveCalls = [];
  h.createCalls = [];
  h.audit = [];
  h.order = [];
  h.slugCalls = [];
  h.legacy.insertVilla.mockClear();
  h.legacy.updateVillaById.mockClear();
  prices.mockClear();
  h.createResult = { ok: true, id: "new-villa", results: [] };
});

describe("villa — alan ayrımı", () => {
  it("villa merkezi yazmada; 14 modülün tamamı kayıtlı", () => {
    expect(CONTENT_WRITE_MIGRATED.has("villa")).toBe(true);
    expect(CONTENT_WRITE_MIGRATED.size).toBe(14);
  });
  it("yalnız açıklama/rozet/SEO metinleri çevrilebilir; ad, kapasite, harita, noindex, düzen teknik", () => {
    const { content, technical } = splitVillaCore({
      title: "V", description: "d", badge: "b", seo_title: "s", seo_description: null, guests: 4,
      noindex: true, slug: "x", latitude: 1, bedroom_layout: [], search_title: "v", id: "i",
    });
    expect(Object.keys(content).sort()).toEqual(["badge", "description", "seo_description", "seo_title"]);
    expect(Object.keys(technical).sort()).toEqual(["bedroom_layout", "guests", "latitude", "noindex", "title"]);
  });
});

describe("villa — oluşturma", () => {
  for (const root of ["tr", "en", "de"] as const) {
    it(`ana dil ${root}: tek createContent; ilişkiler/mesafe/fiyat SONRA, eskisiyle aynı`, async () => {
      setRoot(root);
      const id = await createVillaFull(BASE_PAYLOAD as never, { actor: CALLER });
      expect(id).toBe("new-villa");
      expect(h.legacy.insertVilla).not.toHaveBeenCalled();
      const [arg] = h.createCalls[0] as [CreateArg];
      expect(arg.entity).toBe("villa");
      expect(arg.technical).toMatchObject({ slug: "villa-deniz-2", title: "Villa Deniz", guests: 6, location_id: "loc-1", noindex: false });
      // jsonb (dizi) teknik alan metin olarak — PG kolon tipine göre jsonb'a çevirir
      expect(arg.technical.pool_heating_months).toBe(JSON.stringify([6, 7]));
      expect("description" in arg.technical).toBe(false);
      expect(arg.locales).toHaveLength(1);
      expect(arg.locales[0].locale).toBe(root);
      expect(String(arg.locales[0].patch.description)).not.toContain("<script");
      expect(arg.locales[0].patch).toMatchObject({ badge: "Popüler", seo_title: "SEO" });
      expect(arg.locales[0].patch.slug).toBe(root === "tr" ? undefined : "villa-deniz-2");
      expect(h.order).toEqual(["core", "types", "prices"]);
      expect(prices).toHaveBeenCalledWith("new-villa", BASE_PAYLOAD.prices);
      expect(h.audit[0]).toMatchObject({ action: "content.create", entity_type: "villa" });
    });
  }
  it("çağıran yoksa eski yol KAPALI (hata), hiçbir şey yazılmaz", async () => {
    await expect(createVillaFull(BASE_PAYLOAD as never)).rejects.toThrow(LEGACY_WRITE_DISABLED_MESSAGE);
    expect(h.createCalls).toHaveLength(0);
    expect(h.legacy.insertVilla).not.toHaveBeenCalled();
  });
  it("merkezi oluşturma başarısızsa ilişki/fiyat YAZILMAZ", async () => {
    h.createResult = { ok: false, code: "conflict", error: "x" };
    await expect(createVillaFull(BASE_PAYLOAD as never, { actor: CALLER })).rejects.toThrow(/slug/);
    expect(h.order).toEqual(["core"]);
    expect(prices).not.toHaveBeenCalled();
  });
});

describe("villa — güncelleme", () => {
  for (const root of ["tr", "en", "de"] as const) {
    it(`ana dil ${root}: içerik ana dile + teknik tek tx; TEKNİK ANAHTAR yeniden üretilmez`, async () => {
      setRoot(root);
      await updateVillaFull({ id: VID, ...BASE_PAYLOAD, form: { ...FORM, title: "Villa Deniz Yeni" } } as never, { actor: CALLER });
      expect(h.slugCalls).toHaveLength(0); // ad değişse de slug üretilmez
      expect(h.legacy.updateVillaById).not.toHaveBeenCalled();
      const [items, , opts] = h.manyCalls[0] as ManyArgs;
      expect(items[0]).toMatchObject({ entity: "villa", parentId: VID, locale: root });
      expect(items[0].patch).toMatchObject({ badge: "Popüler", seo_title: "SEO" });
      const tech = opts.technical?.[0];
      expect(tech?.values).toMatchObject({ title: "Villa Deniz Yeni", guests: 6, noindex: false });
      expect("slug" in (tech?.values ?? {})).toBe(false);
      expect(tech?.values.pool_heating_months).toEqual([6, 7]);
      expect(tech?.jsonColumns).toContain("pool_heating_months");
      // fiyat/mesafe/ilişki senkronu eskisiyle AYNI sırada, AYNI argümanlarla
      expect(h.order).toEqual(["core", "types", "features", "distances", "prices"]);
      expect(prices).toHaveBeenCalledWith(VID, BASE_PAYLOAD.prices);
    });
  }
});

describe("villa — kopyalama", () => {
  it("ana dil EN: kaynağın 3 dil içeriği (slug HARİÇ) yeni villaya; ana dil slug'ı = yeni teknik anahtar; fiyatlar kopyalanır", async () => {
    setRoot("en");
    h.rows = [
      { parentId: SRC, locale: "tr", values: { description: "TR", badge: "Yeni", seo_title: null, seo_description: null }, slug: "villa-deniz" },
      { parentId: SRC, locale: "en", values: { description: "EN", badge: "New", seo_title: "S", seo_description: null }, slug: "sea-villa" },
    ];
    const r = await cloneVilla(SRC, { actor: CALLER });
    expect(r).toEqual({ ok: true, id: "new-villa" });
    const [arg] = h.createCalls[0] as [CreateArg];
    expect(arg.technical).toMatchObject({ slug: "villa-deniz-2", title: "Villa Deniz - Kopya", is_active: false });
    expect("search_title" in arg.technical).toBe(false);
    expect("description" in arg.technical).toBe(false);
    const byLoc = Object.fromEntries(arg.locales.map((l) => [l.locale, l.patch]));
    expect(byLoc.tr).toEqual({ description: "TR", badge: "Yeni", seo_title: null, seo_description: null });
    expect(byLoc.en).toEqual({ description: "EN", badge: "New", seo_title: "S", seo_description: null, slug: "villa-deniz-2" });
    expect(h.legacy.insertVilla).not.toHaveBeenCalled();
    expect(prices).toHaveBeenCalledTimes(1);
  });
  it("çağıran yoksa kopyalama reddedilir", async () => {
    expect(await cloneVilla(SRC)).toEqual({ ok: false, error: LEGACY_WRITE_DISABLED_MESSAGE });
    expect(h.createCalls).toHaveLength(0);
  });
});

describe("villa — düzenleme formu ve çeviri kartı", () => {
  it("overlay: ana dil DE → DE metinleri; slug = DE URL slug'ı; teknik anahtar ayrı", async () => {
    setRoot("de");
    h.rows = [{ parentId: VID, locale: "de", values: { description: "DE", badge: null, seo_title: "DS", seo_description: null }, slug: "meer-villa" }];
    const o = await overlayVillaRoot({ id: VID, title: "Villa Deniz", slug: "villa-deniz", description: "TR" });
    expect(o).toMatchObject({ description: "DE", badge: "", seo_title: "DS", slug: "meer-villa", technical_key: "villa-deniz", title: "Villa Deniz" });
  });
  it("çeviri: ana dil EN iken TR yazılır, EN reddedilir; açıklama sanitize; limit", async () => {
    setRoot("en");
    expect((await saveVillaTranslationCentral(CALLER, { villaId: VID, locale: "tr", description: "<p>a</p><img src=x onerror=y>", slug: "villa-deniz-tr" })).ok).toBe(true);
    const call = h.saveCalls.at(-1) as unknown[];
    expect(call.slice(0, 3)).toEqual(["villa", VID, "tr"]);
    expect(String((call[3] as Record<string, unknown>).description)).not.toContain("onerror");
    expect(await saveVillaTranslationCentral(CALLER, { villaId: VID, locale: "en", description: "x" })).toMatchObject({ ok: false });
    expect(await saveVillaTranslationCentral(CALLER, { villaId: VID, locale: "de", badge: "x".repeat(61) })).toMatchObject({ ok: false });
  });
  it("ana dil slug'ı: ana dilin satırına; guard → 108 açıklaması", async () => {
    setRoot("en");
    expect(await saveVillaRootSlugCentral(CALLER, VID, "sea-villa")).toEqual({ ok: true, slug: "kas-villa" });
    expect((h.saveCalls.at(-1) as unknown[]).slice(0, 4)).toEqual(["villa", VID, "en", { slug: "sea-villa" }]);
    h.saveResult = { ok: false, code: "guard", error: "guard" };
    setRoot("tr");
    const r = await saveVillaRootSlugCentral(CALLER, VID, "yeni");
    expect(r).toMatchObject({ ok: false });
    expect((r as { error: string }).error).toContain("108");
    h.saveResult = { ok: true, created: false, target: "translation", mode: "base", written: ["slug"], slug: "kas-villa" };
  });
  it("eski villa çeviri servisi yazmayı reddeder", async () => {
    expect(await upsertVillaTranslation({ villaId: VID, locale: "en", description: "x" })).toEqual({ ok: false, error: LEGACY_WRITE_DISABLED_MESSAGE });
  });
});
