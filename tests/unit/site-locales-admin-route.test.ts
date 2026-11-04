/* ===============================================================
   🌐 ÇOK DİLLİ MİMARİ FAZ 1 — admin API
   ===============================================================
   /api/admin/settings/locales  GET/PUT  (yetki, doğrulama, migration yok)
   /api/admin/settings          PUT      (ana dil değişimi kilidi — 409)
   =============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  auth: { ok: true, caller: { id: "c1" } } as unknown,
  hasPerm: true,
  settingsRow: { id: "s1", public_default_locale: "tr" } as Record<string, unknown>,
  rows: [
    { code: "tr", is_enabled: true, sort_order: 10 },
    { code: "en", is_enabled: true, sort_order: 20 },
    { code: "de", is_enabled: true, sort_order: 30 },
  ],
  findAllError: null as null | { message: string },
  setEnabledError: null as null | { message: string },
  setEnabled: vi.fn(),
  updateById: vi.fn(),
}));

vi.mock("@/lib/admin-route-auth", () => ({
  authorizeAdminCaller: vi.fn(async () => h.auth),
}));
vi.mock("@/lib/auth/action-authz", () => ({
  callerHasPermission: vi.fn(async () => h.hasPerm),
  FORBIDDEN_MESSAGE: "Yetkiniz yok",
}));
vi.mock("@/lib/db/settings.repository.server", () => ({
  settingsServerRepository: {
    findSingleton: vi.fn(async () => ({ data: h.settingsRow, error: null })),
    updateById: (...a: unknown[]) => {
      h.updateById(...a);
      return Promise.resolve({ error: null });
    },
  },
}));
vi.mock("@/lib/db/site-locale.repository.server", () => ({
  siteLocaleRepository: {
    findAll: vi.fn(async () =>
      h.findAllError
        ? { data: null, error: h.findAllError }
        : { data: h.rows, error: null }
    ),
    setEnabled: (codes: string[]) => {
      h.setEnabled(codes);
      return Promise.resolve({ data: null, error: h.setEnabledError });
    },
  },
}));

import { GET, PUT } from "@/app/api/admin/settings/locales/route";
import { PUT as putSettings } from "@/app/api/admin/settings/route";

function req(method: string, body?: unknown) {
  return new Request("http://x/api/admin/settings/locales", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  h.auth = { ok: true, caller: { id: "c1" } };
  h.hasPerm = true;
  h.settingsRow = { id: "s1", public_default_locale: "tr" };
  h.findAllError = null;
  h.setEnabledError = null;
  h.setEnabled.mockClear();
  h.updateById.mockClear();
});

describe("/api/admin/settings/locales", () => {
  it("GET → ana dil + satırlar", async () => {
    const res = await GET(req("GET"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toMatchObject({ ok: true, rootLocale: "tr" });
    expect(json.locales).toHaveLength(3);
  });

  it("yetkisiz → auth status; settings izni yok → 403 ve yazma YOK", async () => {
    h.auth = { ok: false, status: 401, error: "Oturum yok" };
    expect((await PUT(req("PUT", { enabled: ["tr"] }))).status).toBe(401);
    h.auth = { ok: true, caller: { id: "c1" } };
    h.hasPerm = false;
    expect((await PUT(req("PUT", { enabled: ["tr"] }))).status).toBe(403);
    expect(h.setEnabled).not.toHaveBeenCalled();
  });

  it("PUT geçerli → normalize edilmiş liste RPC'ye gider", async () => {
    const res = await PUT(req("PUT", { enabled: ["de", "tr"] }));
    expect(res.status).toBe(200);
    expect(h.setEnabled).toHaveBeenCalledWith(["tr", "de"]);
  });

  it.each<[unknown, string]>([
    [{ enabled: "tr" }, "dizi değil"],
    [{ enabled: [] }, "boş"],
    [{ enabled: ["tr", "fr"] }, "bilinmeyen kod"],
    [{ enabled: ["en", "de"] }, "ana dil/TR kapalı"],
  ])("PUT %j → 400 (%s), yazma YOK", async (body, _label) => {
    void _label;
    const res = await PUT(req("PUT", body));
    expect(res.status).toBe(400);
    expect(h.setEnabled).not.toHaveBeenCalled();
  });

  it("ana dil DE iken DE'yi kapatmak → 400", async () => {
    h.settingsRow = { id: "s1", public_default_locale: "de" };
    const res = await PUT(req("PUT", { enabled: ["tr", "en"] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Ana dil kapatılamaz.");
  });

  it("migration 101 yok → 503 + migrationMissing", async () => {
    h.findAllError = { message: 'relation "site_locales" does not exist' };
    const res = await GET(req("GET"));
    expect(res.status).toBe(503);
    expect((await res.json()).migrationMissing).toBe(true);
  });

  it("DB trigger hatası → 500, gizlenmez", async () => {
    h.setEnabledError = { message: "Ana dil (tr) kapatılamaz." };
    const res = await PUT(req("PUT", { enabled: ["tr", "en"] }));
    expect(res.status).toBe(500);
  });
});

describe("/api/admin/settings PUT — ana dil kilidi", () => {
  function sreq(body: unknown) {
    return new Request("http://x/api/admin/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("aynı ana dil geri gönderilir → normal kayıt (genel sayfa akışı)", async () => {
    const res = await putSettings(sreq({ site_name: "X", public_default_locale: "tr" }));
    expect(res.status).toBe(200);
    expect(h.updateById).toHaveBeenCalledTimes(1);
  });

  it("ana dil değiştirilmeye çalışılır → 409, yazma YOK", async () => {
    const res = await putSettings(sreq({ public_default_locale: "de" }));
    expect(res.status).toBe(409);
    expect(h.updateById).not.toHaveBeenCalled();
  });

  it("ana dil alanı hiç yok → etkilenmez", async () => {
    const res = await putSettings(sreq({ site_name: "Y" }));
    expect(res.status).toBe(200);
  });
});
