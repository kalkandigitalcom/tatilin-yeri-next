import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";

/* ===============================================================
   Faz 5 — admin paneli → merkezi içerik servisleri (1. dalga: 9 modül)
   =============================================================== */

/* ---------- mock'lar ---------- */
const h = vi.hoisted(() => ({
  settings: { multilingual_enabled: true, public_default_locale: "tr", public_locales: null } as Record<string, unknown>,
  rows: [] as Array<{ parentId: string; locale: string; values: Record<string, unknown>; slug?: string | null }>,
  saveCalls: [] as unknown[][],
  createCalls: [] as unknown[][],
  saveResult: { ok: true, created: false, target: "base", mode: "base", written: ["name"] } as Record<string, unknown>,
  auditRows: [] as Record<string, unknown>[],
  auditFail: false,
  authorize: vi.fn(),
  perms: ["features", "rules", "villa_types", "payment_methods", "menu", "faqs", "price_includes", "homepage_collection", "discount_collection"],
  translationUpsert: vi.fn(),
}));

vi.mock("@/lib/cache.helpers", () => ({ getCachedSettings: async () => h.settings }));
vi.mock("@/lib/db/pg.client", () => ({
  getPgPool: () => ({
    query: async (text: string, values: unknown[]) => {
      if (text.includes("FROM \"villa_feature_translations\"") || text.includes("_translations\" WHERE")) {
        const ids = (values[0] as string[]) ?? [];
        return { rows: h.rows.filter((r) => ids.includes(r.parentId)).map((r) => ({ parent_id: r.parentId, locale: r.locale, ...r.values, slug: r.slug ?? null })) };
      }
      if (text.includes("to_regprocedure")) return { rows: [{ ok: false }] };
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
    h.saveCalls.push(a);
    return { ok: true, results: [] };
  },
  createContent: async (...a: unknown[]) => {
    h.createCalls.push(a);
    return { ok: true, id: "new-id", results: [] };
  },
}));
vi.mock("@/lib/db/admin-activity-log.repository.server", () => ({
  adminActivityLogRepository: {
    insert: async (row: Record<string, unknown>) => {
      if (h.auditFail) throw new Error("log down");
      h.auditRows.push(row);
      return { error: null };
    },
  },
}));
vi.mock("@/lib/admin-route-auth", () => ({ authorizeAdminSession: (...a: unknown[]) => h.authorize(...a) }));
vi.mock("@/lib/db/admin-user.repository.server", () => ({
  adminUserServerRepository: {
    findByIdForSession: async () => ({ data: { id: "admin-1", is_active: true, sidebar_permissions: h.perms }, error: null }),
  },
}));
vi.mock("@/lib/db/translation.repository.server", () => ({
  translationRepository: { upsertOne: (...a: unknown[]) => h.translationUpsert(...a), findAllForParent: vi.fn(), findManyForLocale: vi.fn() },
}));
vi.mock("@/app/services/villa-feature.service", () => ({
  getVillaFeatures: async () => [{ id: "f0000000-0000-0000-0000-000000000001", name: "Havuz (TR taban)" }],
  deleteVillaFeature: async () => true,
}));
vi.mock("@/app/components/admin/notifications/NotificationProvider", () => ({
  useNotify: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), loading: vi.fn(), dismiss: vi.fn(), promise: vi.fn() }),
  useConfirm: () => vi.fn(),
}));

import { adminLocaleLayout, missingFieldsOf } from "@/lib/i18n/content/content-admin";
import { CONTENT_WRITE_MIGRATED, isContentWriteMigrated } from "@/lib/i18n/content/content-write-modules";
import { adminSaveContent } from "@/lib/i18n/content/content-admin.server";
import { localizeAdminRows, saveTranslationRow } from "@/app/(admin)/maki-admin/_content/simple-content.server";
import {
  addVillaFeatureAction,
  getVillaFeaturesAction,
  updateVillaFeatureAction,
} from "@/app/(admin)/maki-admin/features/features.action";
import { saveFeatureTranslationAction } from "@/app/(admin)/maki-admin/features/feature-translations.action";
import { upsertFeatureTranslation } from "@/app/services/villa-feature-translation.service";
import { upsertRuleTranslation } from "@/app/services/rule-item-translation.service";
import { upsertTypeTranslation } from "@/app/services/villa-type-translation.service";
import { upsertMenuTranslation } from "@/app/services/menu-translation.service";
import { upsertFaqTranslation } from "@/app/services/faq-translation.service";
import { upsertPaymentMethodTranslation } from "@/app/services/payment-method-translation.service";
import { upsertPriceIncludeTranslation } from "@/app/services/price-include-item-translation.service";
import LocaleTranslationsPanel from "@/app/components/admin/shared/LocaleTranslationsPanel";

const F1 = "f0000000-0000-0000-0000-000000000001";
const C1 = "c0000000-0000-0000-0000-000000000001";
const CALLER = { ok: true, caller: { id: "admin-1", authUserId: "u1", email: "a@x.test", is_active: true } };

beforeEach(() => {
  h.settings = { multilingual_enabled: true, public_default_locale: "tr", public_locales: null };
  h.rows = [];
  h.saveCalls.length = 0;
  h.createCalls.length = 0;
  h.auditRows.length = 0;
  h.auditFail = false;
  h.saveResult = { ok: true, created: false, target: "base", mode: "base", written: ["name"] };
  h.perms = ["features", "rules", "villa_types", "payment_methods", "menu", "faqs", "price_includes", "homepage_collection", "discount_collection"];
  h.authorize.mockReset();
  h.authorize.mockResolvedValue(CALLER);
  h.translationUpsert.mockReset();
});

describe("Faz 5 — ana dil düzeni (hiçbir dil ayrıcalıklı değil)", () => {
  it("ana dil TR / EN / DE → ana form + diğer iki dil", () => {
    expect(adminLocaleLayout("tr", ["tr", "en", "de"], true).translations).toEqual(["en", "de"]);
    expect(adminLocaleLayout("en", ["en", "tr", "de"], true).translations).toEqual(["tr", "de"]);
    expect(adminLocaleLayout("de", ["de", "tr", "en"], true).translations).toEqual(["tr", "en"]);
    expect(adminLocaleLayout("en", ["en", "de"], true).translations).toEqual(["de", "tr"]); // pasif dil sona
  });
  it("eksik çeviri: alan kuralına göre", () => {
    expect(missingFieldsOf("faq", { question: "Q", answer: "  " })).toEqual(["answer"]);
    expect(missingFieldsOf("villa_feature", undefined)).toEqual(["name"]);
  });
});

describe("Faz 5 — eski yazma yolu KAPALI (1. dalga 9 modül)", () => {
  it("modül listesi", () => {
    /* Faz 5 dalga 2 tamamlandı: 9 basit modül + villa, blog, sayfa, ayarlar,
       popup → 14 türün TAMAMI merkezi yazmada. */
    expect([...CONTENT_WRITE_MIGRATED].sort()).toEqual(
      [
        "blog_post", "discount_collection", "faq", "homepage_collection", "menu", "page", "payment_method",
        "price_include_item", "rule_item", "settings", "site_popup", "villa", "villa_feature", "villa_type",
      ]
    );
    expect(isContentWriteMigrated("villa")).toBe(true);
  });
  it("eski çeviri servisleri yazmayı reddeder, DB'ye inmez", async () => {
    const calls = [
      upsertFeatureTranslation({ featureId: F1, locale: "en", name: "Pool" }),
      upsertRuleTranslation({ ruleId: "r1", locale: "en", title: "No smoking" }),
      upsertTypeTranslation({ typeId: "t1", locale: "en", name: "Lux" }),
      upsertMenuTranslation({ menuId: "m1", locale: "en", name: "Villas" }),
      upsertFaqTranslation({ faqId: "q1", locale: "en", question: "Q", answer: "A" }),
      upsertPaymentMethodTranslation({ paymentMethodId: "p1", locale: "en", name: "Card" }),
      upsertPriceIncludeTranslation({ includeId: "i1", locale: "en", title: "Cleaning" }),
    ];
    for (const r of await Promise.all(calls)) {
      expect(r).toMatchObject({ ok: false, error: expect.stringContaining("eski yazma yolu kapalı") });
    }
    expect(h.translationUpsert).not.toHaveBeenCalled();
  });
  it("admin kodu eski çeviri yazma fonksiyonlarını ARTIK çağırmıyor", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(e.name)) {
          const src = fs.readFileSync(p, "utf8");
          if (/upsert(Type|Feature|Rule|PriceInclude|Faq|Menu|PaymentMethod)Translation\b|replaceFaqs as|addVillaFeature as|updateVillaFeature as|addRuleItem as|updateRuleItem as|addPriceIncludeItem as|updatePriceIncludeItem as|addVillaType as|updateVillaType as|menuServerRepository\.insert/.test(src)) hits.push(p);
        }
      }
    };
    walk(path.join("app", "(admin)"));
    walk(path.join("app", "api", "admin", "menu"));
    expect(hits).toEqual([]);
  });
});

describe("Faz 5 — ana form ana dili düzenler", () => {
  it("ana dil TR: liste TR değerini gösterir; kayıt TR'ye", async () => {
    h.rows = [
      { parentId: F1, locale: "tr", values: { name: "Havuz" } },
      { parentId: F1, locale: "en", values: { name: "Pool" } },
    ];
    const rows = await getVillaFeaturesAction();
    expect(rows[0]).toMatchObject({ id: F1, name: "Havuz", missing_locales: ["de"] });
    expect(await updateVillaFeatureAction(F1, "Havuz 2")).toBe(true);
    expect(h.saveCalls[0].slice(0, 4)).toEqual(["villa_feature", F1, "tr", { name: "Havuz 2" }]);
  });
  it("ana dil EN: liste EN değerini gösterir; kayıt EN'e; çeviri paneli TR'yi düzenler", async () => {
    h.settings = { multilingual_enabled: true, public_default_locale: "en", public_locales: null };
    h.rows = [
      { parentId: F1, locale: "tr", values: { name: "Havuz" } },
      { parentId: F1, locale: "en", values: { name: "Pool" } },
    ];
    const rows = await getVillaFeaturesAction();
    expect(rows[0].name).toBe("Pool");
    await updateVillaFeatureAction(F1, "Pool 2");
    expect(h.saveCalls[0].slice(0, 4)).toEqual(["villa_feature", F1, "en", { name: "Pool 2" }]);
    expect(await saveFeatureTranslationAction({ featureId: F1, locale: "tr", name: "Havuz 3" })).toMatchObject({ ok: true });
    expect(h.saveCalls[1].slice(0, 4)).toEqual(["villa_feature", F1, "tr", { name: "Havuz 3" }]);
    // ana dil çeviri panelinden yazılamaz
    expect(await saveFeatureTranslationAction({ featureId: F1, locale: "en", name: "x" })).toMatchObject({ ok: false });
  });
  it("ana dil DE: yeni kayıt DE'de oluşturulur (TR aynası boş başlar)", async () => {
    h.settings = { multilingual_enabled: true, public_default_locale: "de", public_locales: null };
    expect(await addVillaFeatureAction("Pool DE")).toBe(true);
    expect(h.createCalls[0][0]).toMatchObject({ entity: "villa_feature", locales: [{ locale: "de", patch: { name: "Pool DE" } }] });
  });
  it("ana dilde değer yoksa (opsiyonel override) null; zorunlu adlarda ''", async () => {
    h.settings = { multilingual_enabled: true, public_default_locale: "en", public_locales: null };
    h.rows = [{ parentId: C1, locale: "tr", values: { custom_title: "Özel" } }];
    const [c] = await localizeAdminRows("homepage_collection", [{ id: C1, custom_title: "Özel" }], ["custom_title"], { missingValue: null });
    expect(c.custom_title).toBeNull();
    const [f] = await localizeAdminRows("villa_feature", [{ id: C1, name: "x" }], ["name"]);
    expect(f.name).toBe("");
  });
});

describe("Faz 5 — yetki kontrolü eylemde", () => {
  it("izin yoksa yazma YOK (throw / Yetkisiz)", async () => {
    h.perms = ["dashboard"];
    await expect(updateVillaFeatureAction(F1, "x")).rejects.toThrow();
    expect(await saveFeatureTranslationAction({ featureId: F1, locale: "en", name: "x" })).toEqual({ ok: false, error: "Yetkisiz" });
    expect(h.saveCalls).toHaveLength(0);
  });
  it("oturum yoksa yazma YOK", async () => {
    h.authorize.mockResolvedValue({ ok: false, status: 401, error: "x" });
    await expect(addVillaFeatureAction("x")).rejects.toThrow();
    expect(h.createCalls).toHaveLength(0);
  });
});

describe("Faz 5 — denetim kaydı (mevcut admin_activity_logs kuralları)", () => {
  it("başarılı kayıtta yazılır: aktör, varlık, dil, önce/sonra, diff", async () => {
    h.rows = [{ parentId: F1, locale: "en", values: { name: "Pool" } }];
    await adminSaveContent({ id: "admin-1", email: "a@x.test" }, { entity: "villa_feature", parentId: F1, locale: "en", patch: { name: "Pool 2" }, title: "Pool 2", route: "/maki-admin/features" });
    expect(h.auditRows).toHaveLength(1);
    expect(h.auditRows[0]).toMatchObject({
      admin_user_id: "admin-1",
      admin_email: "a@x.test",
      action: "content.update",
      entity_type: "villa_feature",
      entity_id: F1,
      before_data: { locale: "en", name: "Pool" },
      after_data: { locale: "en", name: "Pool 2" },
    });
    expect(h.auditRows[0].diff_summary).toEqual(expect.arrayContaining([expect.stringContaining("name")]));
  });
  it("başarısız kayıtta yazılmaz; log hatası kaydı BOZMAZ", async () => {
    h.saveResult = { ok: false, code: "conflict", error: "x" };
    await adminSaveContent({ id: "a", email: "e" }, { entity: "villa_feature", parentId: F1, locale: "en", patch: { name: "x" } });
    expect(h.auditRows).toHaveLength(0);
    h.saveResult = { ok: true, created: true };
    h.auditFail = true;
    const r = await adminSaveContent({ id: "a", email: "e" }, { entity: "villa_feature", parentId: F1, locale: "en", patch: { name: "x" } });
    expect(r.ok).toBe(true);
  });
  it("yeni çeviri satırı → content.translation_create", async () => {
    h.saveResult = { ok: true, created: true };
    await adminSaveContent({ id: "a", email: "e" }, { entity: "rule_item", parentId: "r1", locale: "de", patch: { title: "x" } });
    expect(h.auditRows[0].action).toBe("content.translation_create");
  });
});

describe("Faz 5 — saveTranslationRow yalnız ana dil DIŞI", () => {
  it("ana dil TR iken TR reddedilir, EN kabul", async () => {
    expect(await saveTranslationRow({ id: "a", authUserId: "u", email: "e", is_active: true }, "rule_item", "r1", "tr", { title: "x" })).toMatchObject({ ok: false });
    expect(await saveTranslationRow({ id: "a", authUserId: "u", email: "e", is_active: true }, "rule_item", "r1", "en", { title: "x" })).toMatchObject({ ok: true });
  });
});

describe("Faz 5 — ortak çeviri paneli (ana dile göre sekmeler + eksik çeviri)", () => {
  it("ana dil EN: referans English, sekmeler Türkçe + Deutsch; kayıt TR'ye; eksik gösterilir", async () => {
    const save = vi.fn(async (_l: string, v: string) => ({ ok: true as const, row: { name: v } }));
    render(
      <LocaleTranslationsPanel
        recordId={F1}
        referenceValue="Pool"
        field="name"
        requiredMessage="İsim gerekli"
        toastPrefix="feature"
        load={async () => ({
          ok: true,
          rows: [{ locale: "tr", name: "Havuz" }],
          layout: { root: "en", translations: ["tr", "de"], enabled: ["en", "tr", "de"], multilingual: true },
        })}
        save={save}
      />
    );
    expect(await screen.findByText("English (referans, salt okunur)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Türkçe" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Deutsch" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("missing-translations").textContent).toContain("Deutsch"));
    expect(screen.getByTestId("missing-translations").textContent).not.toContain("Türkçe");
    fireEvent.click(screen.getByRole("button", { name: /Türkçe sürümünü kaydet/ }));
    await waitFor(() => expect(save).toHaveBeenCalledWith("tr", "Havuz"));
  });
});
