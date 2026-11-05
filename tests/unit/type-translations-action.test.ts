/* ===============================================================
   🛡️ PHASE 10H — type-translations.action.ts AUTH TESTLERİ
   ===============================================================
   AMAÇ: `saveTypeTranslationAction`'ın `authorizeAdminSession()`'ı
   İLK kontrol olarak çağırdığını, yetkisiz durumda servise/DB'ye HİÇ
   ulaşılmadığını; `loadTypeTranslationsAction`'ın (sayfa zaten
   middleware korumalı) ekstra auth OLMADAN servise ulaştığını
   doğrular.

   Mock convention: `villa-translations-action.test.ts` (Phase 10A) ile
   BİREBİR AYNI desen — yeni bir test mimarisi İCAT EDİLMEDİ.

   ⚠️ Production kodu test için GEVŞETİLMEDİ: auth kontrolü action'da
   olduğu gibi durur, burada yalnız mock'lanır.
   =============================================================== */
import { describe, it, expect, vi, beforeEach } from "vitest";

const authorizeAdminSessionMock = vi.fn();
const getTypeTranslationsMock = vi.fn();
const upsertTypeTranslationMock = vi.fn();

/* 🛡️ SERVER ACTION AUTHZ — permission kaynağı (admin_users.sidebar_permissions).
   "yetkili oturum" artık AKTİF + "villa_types" izinli demek. Assertion'lar aynen. */
const findByIdForSessionMock = vi.fn();
vi.mock("@/lib/db/admin-user.repository.server", () => ({
  adminUserServerRepository: {
    findByIdForSession: (...a: unknown[]) => findByIdForSessionMock(...a),
  },
}));

vi.mock("@/lib/admin-route-auth", () => ({
  authorizeAdminSession: (...args: unknown[]) =>
    authorizeAdminSessionMock(...args),
}));

/* 🌐 Faz 5 — eylem artık ESKİ villa-type-translation.service'e değil,
   merkezi içerik katmanına (simple-content.server → saveContent) delege
   eder. Yetki sözleşmesi (authorizeAdminSession İLK, yetkisizde yazma
   YOK) AYNEN korunur; yalnız delege edilen hedef değişti. */
vi.mock("@/app/(admin)/maki-admin/_content/simple-content.server", () => ({
  loadTranslationRows: (...args: unknown[]) => getTypeTranslationsMock(...args),
  saveTranslationRow: (...args: unknown[]) => upsertTypeTranslationMock(...args),
}));
vi.mock("@/lib/i18n/content/content-admin.server", () => ({
  getAdminLocaleLayout: async () => ({ root: "tr", translations: ["en", "de"], enabled: ["tr", "en", "de"], multilingual: true }),
  getSlugSeparationCapability: async () => false,
  getTechnicalKey: async () => "luks-villalar",
  getAdminContent: async () => ({}),
  adminSaveContent: vi.fn(),
}));
vi.mock("@/lib/i18n/routing/slug-map.server", () => ({ revalidateLocaleSlugs: vi.fn() }));

import {
  loadTypeTranslationsAction,
  saveTypeTranslationAction,
} from "@/app/(admin)/maki-admin/types/type-translations.action";

const TYPE_ID = "type-uuid-1";

beforeEach(() => {
  vi.clearAllMocks();
  findByIdForSessionMock.mockResolvedValue({
    data: { id: "admin-1", is_active: true, sidebar_permissions: ["villa_types"] },
    error: null,
  });
  authorizeAdminSessionMock.mockResolvedValue({
    ok: true,
    caller: { id: "admin-1" },
  });
  upsertTypeTranslationMock.mockResolvedValue({
    ok: true,
    row: { type_id: TYPE_ID, locale: "en", name: "Luxury Villa" },
  });
  getTypeTranslationsMock.mockResolvedValue({
    ok: true,
    rows: [],
    layout: { root: "tr", translations: ["en", "de"], enabled: ["tr", "en", "de"], multilingual: true },
  });
});

describe("saveTypeTranslationAction — authorizeAdminSession İLK kontrol", () => {
  it("1) yetkisiz oturum → { ok:false, error:'Yetkisiz' }, servis HİÇ çağrılmaz", async () => {
    authorizeAdminSessionMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      error: "unauthorized",
    });

    const result = await saveTypeTranslationAction({
      typeId: TYPE_ID,
      locale: "en",
      name: "Luxury Villa",
    });

    expect(result).toEqual({ ok: false, error: "Yetkisiz" });
    expect(upsertTypeTranslationMock).not.toHaveBeenCalled();
  });

  it("2) yetkisiz oturumda DE için de yazma yapılmaz", async () => {
    authorizeAdminSessionMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      error: "forbidden",
    });

    await saveTypeTranslationAction({
      typeId: TYPE_ID,
      locale: "de",
      name: "Luxusvilla",
    });

    expect(upsertTypeTranslationMock).not.toHaveBeenCalled();
  });

  it("3) yetkili oturum → merkezi içerik katmanına delege edilir (EN)", async () => {
    const result = await saveTypeTranslationAction({
      typeId: TYPE_ID,
      locale: "en",
      name: "Luxury Villa",
    });

    expect(authorizeAdminSessionMock).toHaveBeenCalledTimes(1);
    expect(upsertTypeTranslationMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "admin-1" }),
      "villa_type",
      TYPE_ID,
      "en",
      { name: "Luxury Villa" },
      expect.anything()
    );
    expect(result).toEqual({
      ok: true,
      row: { type_id: TYPE_ID, locale: "en", name: "Luxury Villa" },
    });
  });

  it("4) yetkili oturum → DE de delege edilir", async () => {
    await saveTypeTranslationAction({
      typeId: TYPE_ID,
      locale: "de",
      name: "Luxusvilla",
    });

    expect(upsertTypeTranslationMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "admin-1" }),
      "villa_type",
      TYPE_ID,
      "de",
      { name: "Luxusvilla" },
      expect.anything()
    );
  });
});

describe("loadTypeTranslationsAction — okuma (sayfa zaten middleware korumalı)", () => {
  /* 🛡️ DAVRANIŞ DEĞİŞİKLİĞİ (Server Action authz sprint'i): okuma
     action'ı ARTIK "villa_types" izni ister. Eski assertion kapatılan
     açığı kodluyordu; gevşetilmedi, TERSİNE ÇEVRİLDİ. */
  it("5) okuma action'ı da yetki ister → yetkili admin servise delege edilir", async () => {
    const result = await loadTypeTranslationsAction(TYPE_ID);

    expect(authorizeAdminSessionMock).toHaveBeenCalledTimes(1);
    expect(getTypeTranslationsMock).toHaveBeenCalledWith("villa_type", TYPE_ID, ["name"]);
    expect(result).toMatchObject({ ok: true, rows: [], technicalKey: "luks-villalar", slugSeparated: false });
  });
});
