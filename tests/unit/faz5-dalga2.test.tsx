import { beforeEach, describe, expect, it, vi } from "vitest";

/* ===============================================================
   Faz 5 — DALGA 2 — admin modülleri → merkezi içerik servisleri
   (genel ayarlar, popup, blog, CMS sayfaları, villa)
   Merkezi yazma (content-write.server) mock'lanır; gerçek PG davranışı
   tests/integration/content-faz5-dalga2-pg.test.ts'te.
   =============================================================== */

const SID = "5e000000-0000-0000-0000-000000000001";

const h = vi.hoisted(() => ({
  settings: { multilingual_enabled: true, public_default_locale: "tr", public_locales: null } as Record<string, unknown>,
  rows: [] as Array<{ parentId: string; locale: string; values: Record<string, unknown>; slug?: string | null }>,
  manyCalls: [] as unknown[][],
  saveCalls: [] as unknown[][],
  createCalls: [] as unknown[][],
  manyResult: { ok: true, results: [] } as Record<string, unknown>,
  auditRows: [] as Record<string, unknown>[],
  legacyUpdate: vi.fn(async () => ({ error: null })),
  popupRow: null as Record<string, unknown> | null,
  removed: [] as unknown[],
  perms: ["settings"] as string[],
  techKey: "kas-rotasi" as string | null,
  slugSeparated: true,
  blogLegacy: { insert: vi.fn(), updateById: vi.fn() },
  publishedAt: null as string | null,
  pageLegacy: { insert: vi.fn(), updateReturning: vi.fn(), updateById: vi.fn() },
  pageRow: { id: "c1000000-0000-0000-0000-000000000001", title: "TR", slug: "hakkimizda", body: null, content: "ESKİ METİN", sections: [{ type: "richtext", content: "<p>tr</p>" }] } as Record<string, unknown>,
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
      if (text.includes("to_regprocedure")) return { rows: [{ ok: h.slugSeparated }] };
      if (text.startsWith("SELECT slug FROM public.")) return { rows: h.techKey ? [{ slug: h.techKey }] : [] };
      return { rows: [] };
    },
  }),
}));
vi.mock("@/lib/i18n/content/content-write.server", () => ({
  saveContent: async (...a: unknown[]) => {
    h.saveCalls.push(a);
    return { ok: true, created: false, target: "translation", mode: "base", written: [] };
  },
  saveContentMany: async (...a: unknown[]) => {
    h.manyCalls.push(a);
    return h.manyResult;
  },
  createContent: async (...a: unknown[]) => {
    h.createCalls.push(a);
    return { ok: true, id: "new-id", results: [] };
  },
}));
vi.mock("@/lib/db/admin-activity-log.repository.server", () => ({
  adminActivityLogRepository: {
    insert: async (row: Record<string, unknown>) => {
      h.auditRows.push(row);
      return { error: null };
    },
  },
}));
vi.mock("@/lib/db/settings.repository.server", () => ({
  settingsServerRepository: {
    findSingletonId: async () => ({ data: { id: SID }, error: null }),
    findSingleton: async () => ({ data: { id: SID, ...h.settings }, error: null }),
    findSingletonStrict: async () => ({
      data: { id: SID, site_name: "Site", hero_title: "TR Hero (ana kolon)", footer_copyright: "TR ©", ...h.settings },
      error: null,
    }),
    updateById: (...a: unknown[]) => (h.legacyUpdate as unknown as (...x: unknown[]) => unknown)(...a),
  },
}));
vi.mock("@/lib/db/site-popup.repository.server", () => ({
  sitePopupRepository: { find: async () => ({ data: h.popupRow, error: null }) },
}));
vi.mock("@/lib/storage/server", () => ({
  removeServer: async (...a: unknown[]) => {
    h.removed.push(a);
    return { ok: true };
  },
}));
vi.mock("@/lib/admin-route-auth", () => ({
  authorizeAdminCaller: async () => ({ ok: true, caller: { id: "admin-1", email: "a@x", authUserId: "u", is_active: true } }),
  authorizeAdminSession: async () => ({ ok: true, caller: { id: "admin-1", email: "a@x", authUserId: "u", is_active: true } }),
}));
vi.mock("@/lib/auth/action-authz", () => ({
  callerHasPermission: async (_id: string, p: string) => h.perms.includes(p),
  requirePermission: async () => ({ id: "admin-1", email: "a@x" }),
  FORBIDDEN_MESSAGE: "Yetkiniz yok",
}));
vi.mock("@/lib/db/blog.repository.server", () => ({
  blogServerRepository: {
    findPublishedAt: async () => ({ data: { published_at: h.publishedAt }, error: null }),
    findById: async (id: string) => ({ data: { id, title: "TR başlık", slug: h.techKey, body: "<p>tr</p>", is_active: true }, error: null }),
    listAll: async () => ({ data: [{ id: "b1000000-0000-0000-0000-000000000001", title: "TR", slug: "x" }], error: null }),
    insert: (...a: unknown[]) => h.blogLegacy.insert(...a),
    updateById: (...a: unknown[]) => h.blogLegacy.updateById(...a),
  },
}));
vi.mock("@/lib/db/pages.repository.server", () => ({
  pagesServerRepository: {
    findById: async () => ({ data: h.pageRow, error: null }),
    listAll: async () => ({ data: [h.pageRow], error: null }),
    insert: (...a: unknown[]) => h.pageLegacy.insert(...a),
    updateReturning: (...a: unknown[]) => h.pageLegacy.updateReturning(...a),
    updateById: (...a: unknown[]) => h.pageLegacy.updateById(...a),
  },
}));
const assignKey = vi.hoisted(() => vi.fn(async () => ({ ok: true, slug: "deniz", assigned: true })));
vi.mock("@/lib/i18n/content/content-technical-key.server", () => ({
  assignMissingTechnicalKey: (...a: unknown[]) => assignKey(...(a as [])),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/i18n/routing/slug-map.server", () => ({ revalidateLocaleSlugs: vi.fn() }));
vi.mock("@/lib/i18n/routing/invalidate.server", () => ({ invalidatePublicRoutingCaches: vi.fn() }));
vi.mock("@/app/services/revalidate.actions", () => ({ revalidateSettings: vi.fn(async () => {}) }));

import { CONTENT_WRITE_MIGRATED, LEGACY_WRITE_DISABLED_MESSAGE } from "@/lib/i18n/content/content-write-modules";
import {
  clearSettingsTranslationCentral,
  loadSettingsTranslationsCentral,
  overlaySettingsRootContent,
  saveSettingsCentral,
  saveSettingsTranslationCentral,
  splitSettingsValues,
} from "@/app/(admin)/maki-admin/settings/_content/settings-content.server";
import { deleteSettingsTranslation, upsertSettingsTranslation } from "@/app/services/settings-translation.service";
import { updateSettings } from "@/app/services/settings.service";
import { saveSitePopup } from "@/app/services/site-popup.service";
import { saveSitePopupCentral } from "@/app/(admin)/maki-admin/settings/popup/popup-content.server";
import { GET as settingsGET, PUT as settingsPUT } from "@/app/api/admin/settings/route";
import {
  createBlogCentral,
  overlayBlogRoot,
  saveBlogTranslationCentral,
  updateBlogCentral,
} from "@/app/(admin)/maki-admin/blog/blog-content.server";
import { PATCH as blogPATCH, GET as blogGET } from "@/app/api/admin/blog/[id]/route";
import { POST as blogPOST } from "@/app/api/admin/blog/route";
import { upsertBlogTranslation } from "@/app/services/blog-translation.service";
import {
  createPageCentral,
  overlayPageRoot,
  savePageTranslationCentral,
  updatePageCentral,
} from "@/app/(admin)/maki-admin/pages/_content/page-content.server";
import { PATCH as pagePATCH } from "@/app/api/admin/pages/[id]/route";
import { POST as pagePOST } from "@/app/api/admin/pages/route";
import { upsertPageTranslation } from "@/app/services/page-translation.service";
import { createPaymentMethodAction } from "@/app/services/payment-method.action";
import { updateVillaTypeAction } from "@/app/(admin)/maki-admin/types/types.action";
import { savePaymentMethodTranslationAction } from "@/app/(admin)/maki-admin/payment-methods/payment-method-translations.action";
import { PAYMENT_METHOD_TR_NAME_REQUIRED } from "@/lib/i18n/content/payment-method-tr";

const CALLER = { id: "admin-1", email: "a@x", authUserId: "u", is_active: true };

function setRoot(root: "tr" | "en" | "de") {
  h.settings = { multilingual_enabled: true, public_default_locale: root, public_locales: null };
}
type ManyArgs = [
  Array<Record<string, unknown>>,
  Record<string, unknown>,
  { technical?: Array<{ entity: string; parentId: string; values: Record<string, unknown>; jsonColumns?: string[] }> },
];
const lastMany = () => h.manyCalls.at(-1) as ManyArgs;

beforeEach(() => {
  setRoot("tr");
  h.rows = [];
  h.manyCalls = [];
  h.saveCalls = [];
  h.createCalls = [];
  h.auditRows = [];
  h.removed = [];
  h.manyResult = { ok: true, results: [] };
  h.legacyUpdate.mockClear();
  h.perms = ["settings", "blog", "pages", "villas", "payment_methods"];
  h.techKey = "kas-rotasi";
  h.slugSeparated = true;
  h.publishedAt = null;
  h.blogLegacy.insert.mockClear();
  h.blogLegacy.updateById.mockClear();
  h.pageLegacy.insert.mockClear();
  h.pageLegacy.updateReturning.mockClear();
  h.pageLegacy.updateById.mockClear();
});

/* ====================== GENEL AYARLAR ====================== */
describe("genel ayarlar — alan ayrımı", () => {
  it("modül kaydı: settings ve site_popup merkezi yazmada", () => {
    expect(CONTENT_WRITE_MIGRATED.has("settings")).toBe(true);
    expect(CONTENT_WRITE_MIGRATED.has("site_popup")).toBe(true);
  });
  it("yalnız registry'deki 9 alan çevrilebilir; dilden bağımsız alanlar çeviri tablosuna TAŞINMAZ", () => {
    const { content, technical } = splitSettingsValues({
      id: "x",
      site_name: "S",
      phone: "1",
      address: "Adres",
      maintenance_message: "Bakım",
      site_logo: "l.png",
      favicon_url: "f.ico",
      public_default_locale: "tr",
      hero_title: "H",
      default_meta_title: "M",
      business_hours: null,
      hero_primary_cta_href: "/v",
    });
    expect(Object.keys(content).sort()).toEqual(["business_hours", "default_meta_title", "hero_title"]);
    expect(Object.keys(technical).sort()).toEqual(
      ["address", "favicon_url", "hero_primary_cta_href", "maintenance_message", "phone", "public_default_locale", "site_logo", "site_name"]
    );
  });
});

describe("genel ayarlar — kayıt (ana dil TR/EN/DE)", () => {
  for (const root of ["tr", "en", "de"] as const) {
    it(`ana dil ${root}: çevrilebilir alanlar ana dile, diğerleri teknik yamaya — TEK çağrı; audit`, async () => {
      setRoot(root);
      const r = await saveSettingsCentral(CALLER, SID, { site_name: "S", hero_title: "H", footer_copyright: "", watermark_config: { a: 1 } });
      expect(r).toEqual({ ok: true });
      expect(h.manyCalls).toHaveLength(1);
      const [items, ctx, opts] = lastMany();
      expect(items).toEqual([{ entity: "settings", parentId: SID, locale: root, patch: { hero_title: "H", footer_copyright: "" } }]);
      expect(ctx).toEqual({ actorId: "admin-1" });
      expect(opts.technical).toEqual([
        { entity: "settings", parentId: SID, values: { site_name: "S", watermark_config: { a: 1 } }, jsonColumns: ["watermark_config"] },
      ]);
      expect(h.auditRows).toHaveLength(1);
      expect(h.auditRows[0]).toMatchObject({ action: "settings.update", entity_type: "settings" });
      expect(h.legacyUpdate).not.toHaveBeenCalled();
    });
  }
  it("yalnız teknik alan → içerik öğesi yok; yalnız içerik → teknik yama yok", async () => {
    await saveSettingsCentral(CALLER, SID, { phone: "1" });
    expect(lastMany()[0]).toEqual([]);
    await saveSettingsCentral(CALLER, SID, { hero_title: "H" });
    expect(lastMany()[2].technical).toEqual([]);
  });
  it("merkezi yazma hatası → ok:false + kod; audit yazılmaz", async () => {
    h.manyResult = { ok: false, code: "db", error: "x" };
    const r = await saveSettingsCentral(CALLER, SID, { hero_title: "H" });
    expect(r).toMatchObject({ ok: false, code: "db" });
    expect(h.auditRows).toHaveLength(0);
  });
});

describe("genel ayarlar — /api/admin/settings route", () => {
  const put = (body: unknown) =>
    settingsPUT(new Request("http://x/api/admin/settings", { method: "PUT", body: JSON.stringify(body) }));
  it("PUT merkezi yola gider; eski updateById ÇAĞRILMAZ", async () => {
    const res = await put({ site_name: "Yeni", hero_title: "H" });
    expect(res.status).toBe(200);
    expect(h.manyCalls).toHaveLength(1);
    expect(h.legacyUpdate).not.toHaveBeenCalled();
  });
  it("ana dil genel formdan değiştirilemez (409) — içerik taşıma/yazma YOK", async () => {
    const res = await put({ public_default_locale: "en", hero_title: "H" });
    expect(res.status).toBe(409);
    expect(h.manyCalls).toHaveLength(0);
  });
  it("izin yoksa 403, yazma yok", async () => {
    h.perms = [];
    const res = await put({ site_name: "x" });
    expect(res.status).toBe(403);
    expect(h.manyCalls).toHaveLength(0);
  });
  it("doğrulama hatası 400 döner", async () => {
    h.manyResult = { ok: false, code: "validation", error: "hero_title metin olmalı" };
    const res = await put({ hero_title: 5 });
    expect(res.status).toBe(400);
  });
  it("GET: ana dil EN iken çevrilebilir alanlar EN değeriyle, dilden bağımsızlar ana tablodan", async () => {
    setRoot("en");
    h.rows = [{ parentId: SID, locale: "en", values: { hero_title: "EN Hero", footer_copyright: null } }];
    const res = await settingsGET(new Request("http://x/api/admin/settings"));
    const j = (await res.json()) as { settings: Record<string, unknown> };
    expect(j.settings.hero_title).toBe("EN Hero");
    expect(j.settings.footer_copyright).toBeNull();
    expect(j.settings.site_name).toBe("Site");
  });
  it("GET: ana dil TR iken satır aynen (eski davranış)", async () => {
    const j = (await (await settingsGET(new Request("http://x/api/admin/settings"))).json()) as { settings: Record<string, unknown> };
    expect(j.settings.hero_title).toBe("TR Hero (ana kolon)");
  });
});

describe("genel ayarlar — çeviriler ekranı", () => {
  it("ana dil EN: TR bir çeviri dilidir ve yazılabilir; EN (ana dil) reddedilir", async () => {
    setRoot("en");
    h.rows = [
      { parentId: SID, locale: "en", values: { hero_title: "EN" } },
      { parentId: SID, locale: "tr", values: { hero_title: "TR" } },
    ];
    const load = await loadSettingsTranslationsCentral(null);
    expect(load.ok && load.data.rootLocale).toBe("en");
    expect(load.ok && load.data.root.hero_title).toBe("EN");
    expect(load.ok && Object.keys(load.data.translations)).toEqual(["tr"]);
    const ok = await saveSettingsTranslationCentral(CALLER, { locale: "tr", hero_title: "  Merhaba  ", footer_copyright: "   " });
    expect(ok.ok).toBe(true);
    const call = h.saveCalls.at(-1) as unknown[];
    expect(call.slice(0, 3)).toEqual(["settings", SID, "tr"]);
    const patch = call[3] as Record<string, unknown>;
    expect(patch.hero_title).toBe("Merhaba"); // trim
    expect(patch.footer_copyright).toBeNull(); // boş → NULL
    expect(Object.keys(patch)).toHaveLength(9); // alan whitelist'i (spread yok)
    const bad = await saveSettingsTranslationCentral(CALLER, { locale: "en", hero_title: "x" });
    expect(bad).toMatchObject({ ok: false });
  });
  it("uzunluk limiti korunur; temizleme 9 alanı NULL yapar", async () => {
    const long = await saveSettingsTranslationCentral(CALLER, { locale: "en", default_meta_title: "x".repeat(5000) });
    expect(long).toMatchObject({ ok: false });
    expect(h.saveCalls).toHaveLength(0);
    expect((await clearSettingsTranslationCentral(CALLER, "de")).ok).toBe(true);
    const patch = h.saveCalls.at(-1)?.[3] as Record<string, unknown>;
    expect(Object.values(patch).every((v) => v === null)).toBe(true);
    expect(Object.keys(patch)).toHaveLength(9);
  });
  it("overlay ana dil TR iken satırı değiştirmez", async () => {
    const row = { id: SID, hero_title: "TR" };
    expect(await overlaySettingsRootContent(row)).toBe(row);
  });
});

describe("genel ayarlar — eski yazma yolları KAPALI", () => {
  it("settings-translation.service upsert/delete ve settings.service.updateSettings reddeder", async () => {
    expect(await upsertSettingsTranslation({ locale: "en", hero_title: "x" })).toEqual({ ok: false, error: LEGACY_WRITE_DISABLED_MESSAGE });
    expect(await deleteSettingsTranslation("en")).toEqual({ ok: false, error: LEGACY_WRITE_DISABLED_MESSAGE });
    expect(await updateSettings({ site_name: "x" } as never)).toBe(false);
    expect(h.legacyUpdate).not.toHaveBeenCalled();
  });
});

/* ====================== POPUP ====================== */
describe("popup — merkezi kayıt", () => {
  const base = {
    isEnabled: true,
    imagePath: null,
    title: "Yaz",
    description: "",
    highlight: "",
    stats: [],
    buttonText: "Git",
    buttonUrl: "/villalar",
    showButton: true,
    scope: "home",
    dismiss: "1d",
    startDate: "",
    endDate: "",
  };
  beforeEach(() => {
    h.popupRow = { id: 1, is_enabled: false, image_path: null, show_button: true, display_scope: "home", dismiss_duration: "session", stats: [] };
  });
  for (const root of ["tr", "en", "de"] as const) {
    it(`ana dil ${root}: ana dil öğesi + diğer diller + teknik yama tek çağrıda`, async () => {
      setRoot(root);
      const others = (["tr", "en", "de"] as const).filter((l) => l !== root);
      const r = await saveSitePopupCentral(CALLER, {
        ...base,
        translations: Object.fromEntries(others.map((l) => [l, { title: `T-${l}`, stats: ["", "  "], buttonText: "", buttonUrl: "" }])),
      });
      expect(r.ok).toBe(true);
      const [items, , opts] = lastMany();
      expect(items.map((i) => i.locale)).toEqual([root, ...others]);
      expect(items[0].patch).toMatchObject({ title: "Yaz", button_text: "Git", button_url: "/villalar", stats: [] });
      expect(items[1].patch).toMatchObject({ title: `T-${others[0]}`, stats: [], button_text: null, button_url: null });
      expect(opts.technical?.[0].values).toMatchObject({ is_enabled: true, display_scope: "home", dismiss_duration: "1d", show_button: true });
      expect(h.auditRows).toHaveLength(1);
    });
  }
  it("güvensiz buton linki (her dilde) reddedilir, yazma yok", async () => {
    expect(await saveSitePopupCentral(CALLER, { ...base, buttonUrl: "javascript:alert(1)" })).toMatchObject({ ok: false });
    expect(
      await saveSitePopupCentral(CALLER, { ...base, translations: { en: { buttonText: "Go", buttonUrl: "//evil.com" } } })
    ).toMatchObject({ ok: false });
    expect(h.manyCalls).toHaveLength(0);
  });
  it("içeriksiz popup açılamaz; geçersiz gösterim ayarı reddedilir", async () => {
    expect(await saveSitePopupCentral(CALLER, { ...base, title: "", buttonText: "" })).toMatchObject({ ok: false });
    expect(await saveSitePopupCentral(CALLER, { ...base, dismiss: "day" })).toMatchObject({ ok: false });
    expect(h.manyCalls).toHaveLength(0);
  });
  it("eski popup servisi yazmayı reddeder", async () => {
    expect(await saveSitePopup(base as never)).toEqual({ ok: false, error: LEGACY_WRITE_DISABLED_MESSAGE });
  });
});

/* ====================== BLOG ====================== */
const BID = "b1000000-0000-0000-0000-000000000001";
type CreateArgs = [{ entity: string; technical: Record<string, unknown>; locales: Array<{ locale: string; patch: Record<string, unknown> }> }];

describe("blog — oluşturma", () => {
  for (const root of ["tr", "en", "de"] as const) {
    it(`ana dil ${root}: teknik anahtar + yayın alanları ana tabloya, metin ana dile; tek createContent`, async () => {
      setRoot(root);
      const r = await createBlogCentral(CALLER, {
        title: " Kaş rotası ",
        slug: "kas-rotasi",
        body: '<p>a</p><script>alert(1)</script>',
        excerpt: " ",
        category: "Rota",
        is_active: true,
      });
      expect(r).toEqual({ ok: true, id: "new-id" });
      const [input] = h.createCalls.at(-1) as CreateArgs;
      expect(input.entity).toBe("blog_post");
      expect(input.technical).toMatchObject({ slug: "kas-rotasi", category: "Rota", is_active: true });
      expect(typeof input.technical.published_at).toBe("string");
      expect(input.locales).toHaveLength(1);
      expect(input.locales[0].locale).toBe(root);
      expect(input.locales[0].patch).toMatchObject({ title: "Kaş rotası", excerpt: null });
      expect(String(input.locales[0].patch.body)).not.toContain("<script");
      // TR: slug 108 INSERT tohumu/ayna; TR dışı: ana dilin URL slug'ı = teknik anahtar
      expect(input.locales[0].patch.slug).toBe(root === "tr" ? undefined : "kas-rotasi");
      expect(h.auditRows[0]).toMatchObject({ action: "content.create", entity_type: "blog_post" });
    });
  }
  it("taslak: published_at null; başlık/slug zorunlu", async () => {
    await createBlogCentral(CALLER, { title: "T", slug: "t", is_active: false });
    expect((h.createCalls.at(-1) as CreateArgs)[0].technical.published_at).toBeNull();
    expect(await createBlogCentral(CALLER, { title: "", slug: "t" })).toMatchObject({ ok: false, status: 400 });
  });
  it("POST route merkezi yola gider; eski insert ÇAĞRILMAZ; izin yoksa 403", async () => {
    const res = await blogPOST(new Request("http://x", { method: "POST", body: JSON.stringify({ title: "T", slug: "t" }) }));
    expect(res.status).toBe(200);
    expect(h.blogLegacy.insert).not.toHaveBeenCalled();
    h.perms = [];
    const res2 = await blogPOST(new Request("http://x", { method: "POST", body: JSON.stringify({ title: "T", slug: "t" }) }));
    expect(res2.status).toBe(403);
    expect(h.createCalls).toHaveLength(1);
  });
});

describe("blog — güncelleme", () => {
  it("aynı slug geri gönderilirse slug YAZILMAZ; teknik anahtar hiç yazılmaz", async () => {
    setRoot("en");
    h.rows = [{ parentId: BID, locale: "en", values: { title: "EN" }, slug: "kas-route" }];
    await updateBlogCentral(CALLER, BID, { title: "EN 2", slug: "kas-route" });
    const [items, , opts] = lastMany();
    expect(items[0]).toMatchObject({ locale: "en", patch: { title: "EN 2" } });
    expect("slug" in (items[0].patch as Record<string, unknown>)).toBe(false);
    expect(Object.keys(opts.technical?.[0].values ?? {})).not.toContain("slug");
  });
  it("slug değişince ana dilin satırına yazılır (geçmiş/yönlendirme merkezi serviste); boş → temizle", async () => {
    setRoot("de");
    h.rows = [{ parentId: BID, locale: "de", values: { title: "DE" }, slug: "kas-route" }];
    await updateBlogCentral(CALLER, BID, { slug: "kas-tour" });
    expect(lastMany()[0][0]).toMatchObject({ locale: "de", patch: { slug: "kas-tour" } });
    await updateBlogCentral(CALLER, BID, { slug: "" });
    expect(lastMany()[0][0]).toMatchObject({ patch: { slug: null } });
  });
  it("TR ana dil + 108 yok: TR slug değişimi guard → anlaşılır 409", async () => {
    h.slugSeparated = false;
    h.manyResult = { ok: false, code: "guard", error: "guard" };
    const r = await updateBlogCentral(CALLER, BID, { slug: "yeni" });
    expect(r).toMatchObject({ ok: false, status: 409 });
    expect((r as { error: string }).error).toContain("108");
  });
  it("yayın: ilk yayında published_at set; zaten varsa korunur; taslağa alma tarihi silmez", async () => {
    await updateBlogCentral(CALLER, BID, { is_active: true });
    expect(typeof lastMany()[2].technical?.[0].values.published_at).toBe("string");
    h.publishedAt = "2026-01-01T00:00:00Z";
    await updateBlogCentral(CALLER, BID, { is_active: true });
    expect("published_at" in (lastMany()[2].technical?.[0].values ?? {})).toBe(false);
    await updateBlogCentral(CALLER, BID, { is_active: false });
    expect(lastMany()[2].technical?.[0].values).toMatchObject({ is_active: false });
    expect("published_at" in (lastMany()[2].technical?.[0].values ?? {})).toBe(false);
  });
  it("PATCH route merkezi; eski updateById ÇAĞRILMAZ; GET ana dil değerini + teknik anahtarı döner", async () => {
    setRoot("en");
    h.rows = [{ parentId: BID, locale: "en", values: { title: "EN T", body: "<p>en</p>" }, slug: "kas-route" }];
    const res = await blogPATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify({ title: "X" }) }), { params: Promise.resolve({ id: BID }) });
    expect(res.status).toBe(200);
    expect(h.blogLegacy.updateById).not.toHaveBeenCalled();
    const g = (await (await blogGET(new Request("http://x"), { params: Promise.resolve({ id: BID }) })).json()) as { data: Record<string, unknown> };
    expect(g.data).toMatchObject({ title: "EN T", body: "<p>en</p>", slug: "kas-route", technical_key: "kas-rotasi", root_locale: "en" });
  });
  it("overlay: ana dil TR ve tr satırı yoksa ana tablo değerleri (eski davranış)", async () => {
    const row = { id: BID, title: "TR", slug: "kas-rotasi", body: "b" };
    expect(await overlayBlogRoot(row)).toMatchObject({ title: "TR", slug: "kas-rotasi", technical_key: "kas-rotasi" });
  });
});

describe("blog — çeviri kartı", () => {
  it("ana dil EN: TR yazılabilir, EN reddedilir; gövde sanitize; limitler", async () => {
    setRoot("en");
    const ok = await saveBlogTranslationCentral(CALLER, { postId: BID, locale: "tr", title: " Başlık ", body: "<img src=x onerror=alert(1)>", slug: "kas-rotasi-tr" });
    expect(ok.ok).toBe(true);
    const call = h.saveCalls.at(-1) as unknown[];
    expect(call.slice(0, 3)).toEqual(["blog_post", BID, "tr"]);
    const patch = call[3] as Record<string, unknown>;
    expect(patch.title).toBe("Başlık");
    expect(String(patch.body)).not.toContain("onerror");
    expect(patch.slug).toBe("kas-rotasi-tr");
    expect(await saveBlogTranslationCentral(CALLER, { postId: BID, locale: "en", title: "x" })).toMatchObject({ ok: false });
    expect(await saveBlogTranslationCentral(CALLER, { postId: BID, locale: "de", title: "x".repeat(201) })).toMatchObject({ ok: false });
  });
  it("eski blog çeviri servisi yazmayı reddeder", async () => {
    expect(await upsertBlogTranslation({ postId: BID, locale: "en", title: "x" })).toEqual({ ok: false, error: LEGACY_WRITE_DISABLED_MESSAGE });
  });
});

/* ====================== CMS SAYFALARI ====================== */
const PID = "c1000000-0000-0000-0000-000000000001";

describe("sayfa — oluşturma", () => {
  for (const root of ["tr", "en", "de"] as const) {
    it(`ana dil ${root}: içerik + bölümler ana dile; noindex/menü/kapak teknik; eski content YAZILMAZ`, async () => {
      setRoot(root);
      const r = await createPageCentral(CALLER, {
        title: "Hakkımızda",
        slug: "hakkimizda",
        body: "<p>x</p>",
        content: "<p>x</p>",
        excerpt: "",
        sections: [{ type: "richtext", content: "<p>s</p>" }, { type: "bilinmeyen" }],
        noindex: true,
        is_active: true,
        show_in_menu: false,
        cover_image: null,
      });
      expect(r.ok).toBe(true);
      const [input] = h.createCalls.at(-1) as CreateArgs;
      expect(input.entity).toBe("page");
      expect(input.technical).toMatchObject({ slug: "hakkimizda", noindex: true, is_active: true, show_in_menu: false });
      expect("content" in input.technical).toBe(false);
      expect(input.locales[0].locale).toBe(root);
      expect(input.locales[0].patch).toMatchObject({ title: "Hakkımızda", body: "<p>x</p>", excerpt: null });
      expect(input.locales[0].patch.sections).toEqual([{ type: "richtext", content: "<p>s</p>" }]); // geçersiz bölüm düşer
      expect(input.locales[0].patch.slug).toBe(root === "tr" ? undefined : "hakkimizda");
    });
  }
  it("POST route merkezi; eski insert ÇAĞRILMAZ", async () => {
    const res = await pagePOST(new Request("http://x", { method: "POST", body: JSON.stringify({ title: "T", slug: "t" }) }));
    expect(res.status).toBe(200);
    expect(h.pageLegacy.insert).not.toHaveBeenCalled();
  });
});

describe("sayfa — güncelleme ve body/content sözleşmesi", () => {
  it("gövde boşaltılınca \"\" yazılır (eski content geri gelmez); null gönderilse de \"\"; content anahtarı yok sayılır", async () => {
    await updatePageCentral(CALLER, PID, { body: "   ", content: "ESKİ" });
    expect(lastMany()[0][0]).toMatchObject({ locale: "tr", patch: { body: "" } });
    await updatePageCentral(CALLER, PID, { body: null });
    expect((lastMany()[0][0].patch as Record<string, unknown>).body).toBe("");
    expect(JSON.stringify(lastMany())).not.toContain("ESKİ");
  });
  it("bölümler ana formdan YAZILMAZ; noindex/yayın/menü teknik yamada", async () => {
    await updatePageCentral(CALLER, PID, { title: "T", sections: [{ type: "richtext", content: "x" }], noindex: false, is_active: true, show_in_menu: true });
    const [items, , opts] = lastMany();
    expect("sections" in (items[0].patch as Record<string, unknown>)).toBe(false);
    expect(opts.technical?.[0].values).toEqual({ noindex: false, is_active: true, show_in_menu: true });
  });
  it("başlık boş olamaz; aynı slug yazılmaz; farklı slug ana dile", async () => {
    expect(await updatePageCentral(CALLER, PID, { title: "  " })).toMatchObject({ ok: false, status: 400 });
    h.techKey = "hakkimizda";
    await updatePageCentral(CALLER, PID, { title: "T", slug: "hakkimizda" });
    expect("slug" in (lastMany()[0][0].patch as Record<string, unknown>)).toBe(false);
    await updatePageCentral(CALLER, PID, { slug: "biz-kimiz" });
    expect(lastMany()[0][0]).toMatchObject({ patch: { slug: "biz-kimiz" } });
  });
  it("PATCH route merkezi; eski updateReturning ÇAĞRILMAZ", async () => {
    const res = await pagePATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify({ title: "Yeni" }) }), { params: Promise.resolve({ id: PID }) });
    expect(res.status).toBe(200);
    expect(h.pageLegacy.updateReturning).not.toHaveBeenCalled();
  });
  it("overlay: ana dil EN → EN içerik, eski TR content GİZLİ; EN'de bölüm yoksa yapı ana tablodan", async () => {
    setRoot("en");
    h.rows = [{ parentId: PID, locale: "en", values: { title: "About", body: "" }, slug: "about" }];
    const o = await overlayPageRoot(h.pageRow);
    expect(o).toMatchObject({ title: "About", body: "", slug: "about", content: null, technical_key: "hakkimizda", root_locale: "en" });
    expect(o.sections).toEqual(h.pageRow.sections);
  });
  it("overlay: ana dil TR ve TR gövdesi NULL → eski content formda görünür (eski davranış)", async () => {
    h.rows = [{ parentId: PID, locale: "tr", values: { title: "TR", body: null }, slug: "hakkimizda" }];
    const o = await overlayPageRoot(h.pageRow);
    expect(o.body).toBeNull();
    expect(o.content).toBe("ESKİ METİN");
  });
});

describe("sayfa — çeviri kartı", () => {
  it("ana dil DE: TR ve EN yazılabilir, DE reddedilir; boş → NULL; bölümler parse; geçersiz → NULL", async () => {
    setRoot("de");
    const ok = await savePageTranslationCentral(CALLER, { pageId: PID, locale: "tr", title: "", body: " ", sections: [{ type: "x" }] });
    expect(ok.ok).toBe(true);
    const patch = (h.saveCalls.at(-1) as unknown[])[3] as Record<string, unknown>;
    expect(patch).toMatchObject({ title: null, body: null, sections: null });
    await savePageTranslationCentral(CALLER, { pageId: PID, locale: "en", title: "About" });
    expect("sections" in ((h.saveCalls.at(-1) as unknown[])[3] as Record<string, unknown>)).toBe(false);
    expect(await savePageTranslationCentral(CALLER, { pageId: PID, locale: "de", title: "x" })).toMatchObject({ ok: false });
  });
  it("eski sayfa çeviri servisi yazmayı reddeder", async () => {
    expect(await upsertPageTranslation({ pageId: PID, locale: "en", title: "x" })).toEqual({ ok: false, error: LEGACY_WRITE_DISABLED_MESSAGE });
  });
});

/* ====================== RİSK 1: ÖDEME YÖNTEMİ TR ADI ====================== */
describe("ödeme yöntemi — voucher/e-posta için Türkçe ad (yalnız bu modül)", () => {
  it("ana dil TR: yalnız TR adı, ek alan gerekmez (eski davranış)", async () => {
    await createPaymentMethodAction({ name: "Havale" });
    const [input] = h.createCalls.at(-1) as CreateArgs;
    expect(input.locales).toEqual([{ locale: "tr", patch: { name: "Havale" } }]);
  });
  for (const root of ["en", "de"] as const) {
    it(`ana dil ${root}: TR adı yoksa oluşturma REDDEDİLİR; varsa aynı transaction'da TR satırına yazılır`, async () => {
      setRoot(root);
      await expect(createPaymentMethodAction({ name: "Bank transfer" })).rejects.toThrow(PAYMENT_METHOD_TR_NAME_REQUIRED);
      await expect(createPaymentMethodAction({ name: "Bank transfer", name_tr: "  " })).rejects.toThrow(PAYMENT_METHOD_TR_NAME_REQUIRED);
      expect(h.createCalls).toHaveLength(0);
      await createPaymentMethodAction({ name: "Bank transfer", name_tr: "Havale" });
      const [input] = h.createCalls.at(-1) as CreateArgs;
      expect(input.locales).toEqual([
        { locale: root, patch: { name: "Bank transfer" } },
        { locale: "tr", patch: { name: "Havale" } },
      ]);
    });
  }
  it("çeviri panelinde TR adı boşaltılamaz; diğer diller boş bırakılabilir (genel kural değişmedi)", async () => {
    setRoot("en");
    const PMID = "d1000000-0000-0000-0000-000000000001";
    expect(await savePaymentMethodTranslationAction({ paymentMethodId: PMID, locale: "tr", name: " " })).toEqual({
      ok: false,
      error: PAYMENT_METHOD_TR_NAME_REQUIRED,
    });
    expect(h.saveCalls).toHaveLength(0);
    expect((await savePaymentMethodTranslationAction({ paymentMethodId: PMID, locale: "de", name: "" })).ok).toBe(true);
    expect((await savePaymentMethodTranslationAction({ paymentMethodId: PMID, locale: "tr", name: "Havale" })).ok).toBe(true);
  });
});

/* ====================== RİSK 2: TEKNİK ANAHTARI BOŞ ESKİ KATEGORİ ====================== */
describe("villa tipi — boş teknik anahtar", () => {
  it("ad kaydı sonrası eksik anahtar BİR KEZ atanır (dolu anahtarın korunması: izole PG testi)", async () => {
    assignKey.mockClear();
    const TID = "e1000000-0000-0000-0000-000000000001";
    expect(await updateVillaTypeAction(TID, "Deniz Manzaralı", "yok-sayilir")).toBe(true);
    expect(assignKey).toHaveBeenCalledWith("villa_type", TID, "Deniz Manzaralı");
    // teknik anahtar yazımı içerik kaydına GİRMEZ
    expect(JSON.stringify(h.saveCalls.at(-1))).not.toContain("yok-sayilir");
  });
});
