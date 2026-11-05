/* ===============================================================
   🌐 FAZ 4 — /api/admin/settings/root-locale + genel ayarlar kilidi
   ===============================================================
   Yetki, doğrulama, onay, iyimser çakışma, eş zamanlı istekler,
   başarısızlıkta eski ana dil korunur, cache geçersiz kılma ve geçiş
   kaydı. Repository'ler mock'lanır; DB kilit davranışı migration 104
   ile izole PostgreSQL'de ayrıca test edildi.
   =============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  auth: { ok: true, caller: { id: "c1", email: "a@x.test" } } as unknown,
  hasPerm: true,
  settings: { id: "s1", public_default_locale: "tr", multilingual_enabled: true } as Record<string, unknown>,
  rows: [
    { code: "tr", is_enabled: true, sort_order: 10 },
    { code: "en", is_enabled: true, sort_order: 20 },
    { code: "de", is_enabled: true, sort_order: 30 },
  ],
  /** Sahte DB: settings satırı kilidi altında karşılaştır-ve-yaz. */
  changeImpl: null as null | ((e: string, n: string) => Promise<{ data: unknown; error: { message: string } | null }>),
  changeCalls: [] as [string, string][],
  invalidate: vi.fn(),
  log: vi.fn(async (...a: unknown[]) => (void a, { ok: true })),
  updateById: vi.fn(async (...a: unknown[]) => (void a, { error: null })),
}));

vi.mock("@/lib/admin-route-auth", () => ({ authorizeAdminCaller: vi.fn(async () => h.auth) }));
vi.mock("@/lib/auth/action-authz", () => ({
  callerHasPermission: vi.fn(async () => h.hasPerm),
  FORBIDDEN_MESSAGE: "Yetkiniz yok",
}));
vi.mock("@/lib/db/settings.repository.server", () => ({
  settingsServerRepository: {
    findSingleton: vi.fn(async () => ({ data: { ...h.settings }, error: null })),
    updateById: (...a: unknown[]) => h.updateById(...a),
  },
}));

/* 🌐 Faz 5 dalga 2 — genel ayarlar PUT'u artık merkezi yazmayı
   (saveSettingsCentral → saveContentMany + teknik yama) kullanır. Bu
   route testleri yetki/ana-dil/çoklu-dil kurallarını doğrular; yazma
   adımı aynı spy'a yönlendirilir (çağrı sayısı/sırası beklentileri
   aynen geçerli). Merkezi yolun kendisi faz5-dalga2 testlerinde. */
vi.mock("@/app/(admin)/maki-admin/settings/_content/settings-content.server", () => ({
  saveSettingsCentral: async (_c: unknown, id: string, values: Record<string, unknown>) => {
    const r = (await h.updateById(id, values)) as { error?: { message?: string } | null } | undefined;
    return r?.error ? { ok: false, error: r.error.message ?? "hata" } : { ok: true };
  },
  overlaySettingsRootContent: async (row: unknown) => row,
}));
vi.mock("@/lib/db/site-locale.repository.server", () => ({
  siteLocaleRepository: {
    findAll: vi.fn(async () => ({ data: h.rows, error: null })),
    setEnabled: vi.fn(async () => ({ data: null, error: null })),
    changeRootLocale: (e: string, n: string) => {
      h.changeCalls.push([e, n]);
      return h.changeImpl!(e, n);
    },
  },
}));
vi.mock("@/lib/i18n/routing/invalidate.server", () => ({
  invalidatePublicRoutingCaches: () => h.invalidate(),
}));
vi.mock("@/lib/i18n/routing/slug-map.server", () => ({
  getCachedLocalizedSlugMap: async () => ({ villa: { "deniz-villa": { en: "sea-villa" } } }),
  getCachedRedirectMap: async () => ({}),
}));
vi.mock("@/app/services/admin-activity-log.service", () => ({
  insertAdminActivityLog: (...a: unknown[]) => h.log(...a),
  extractAdminContextFromRequest: () => ({ admin_user_id: "c1", admin_email: "a@x.test" }),
}));

import { GET, POST } from "@/app/api/admin/settings/root-locale/route";
import { PUT as putSettings } from "@/app/api/admin/settings/route";

/** Sahte DB: tek satır; çağrılar SIRAYLA işlenir (FOR UPDATE kilidi gibi). */
let queue: Promise<unknown> = Promise.resolve();
function lockedCompareAndSet(e: string, n: string) {
  const run = queue.then(async () => {
    await new Promise((r) => setTimeout(r, 5));
    if (h.settings.public_default_locale !== e) {
      return { data: null, error: { message: "root_locale_conflict: ana dil değişmiş" } };
    }
    const enabled = h.rows.find((r) => r.code === n)?.is_enabled;
    if (!enabled) return { data: null, error: { message: "Ana dil yalnız aktif bir dil olabilir" } };
    const prev = h.settings.public_default_locale;
    h.settings.public_default_locale = n;
    return { data: prev, error: null };
  });
  queue = run.catch(() => {});
  return run as Promise<{ data: unknown; error: { message: string } | null }>;
}

const post = (body: unknown) =>
  POST(
    new Request("http://x/api/admin/settings/root-locale", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );
const get = (q = "") => GET(new Request(`http://x/api/admin/settings/root-locale${q}`));

beforeEach(() => {
  h.auth = { ok: true, caller: { id: "c1", email: "a@x.test" } };
  h.hasPerm = true;
  h.settings = { id: "s1", public_default_locale: "tr", multilingual_enabled: true };
  h.rows = [
    { code: "tr", is_enabled: true, sort_order: 10 },
    { code: "en", is_enabled: true, sort_order: 20 },
    { code: "de", is_enabled: true, sort_order: 30 },
  ];
  h.changeImpl = lockedCompareAndSet;
  h.changeCalls = [];
  h.invalidate.mockClear();
  h.log.mockClear();
  h.updateById.mockClear();
});

describe("yetki", () => {
  it("oturum yok → 401, izin yok → 403; DB'ye yazılmaz", async () => {
    h.auth = { ok: false, status: 401, error: "Yetkisiz" };
    expect((await post({ expected: "tr", to: "en", confirm: true })).status).toBe(401);
    expect((await get("?to=en")).status).toBe(401);
    h.auth = { ok: true, caller: { id: "c1", email: "a@x.test" } };
    h.hasPerm = false;
    expect((await post({ expected: "tr", to: "en", confirm: true })).status).toBe(403);
    expect((await get("?to=en")).status).toBe(403);
    expect(h.changeCalls).toEqual([]);
    expect(h.settings.public_default_locale).toBe("tr");
  });
});

describe("önizleme (GET)", () => {
  it("geçerli hedef → plan; yazma yok", async () => {
    const res = await get("?to=en");
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, current: "tr", valid: true });
    expect(json.plan.issues).toEqual([]);
    expect(json.plan.rows.find((r: { route: string; locale: string }) => r.route === "villas" && r.locale === "tr"))
      .toMatchObject({ before: "/kiralik-villalar", after: "/tr/kiralik-villalar", outcome: "redirect", status: 307 });
    expect(h.changeCalls).toEqual([]);
  });
  it("kapalı / hatalı dil → valid:false", async () => {
    h.rows = h.rows.map((r) => (r.code === "de" ? { ...r, is_enabled: false } : r));
    expect(await (await get("?to=de")).json()).toMatchObject({ valid: false, code: "disabled" });
    expect(await (await get("?to=fr")).json()).toMatchObject({ valid: false, code: "invalid" });
  });
});

describe("uygulama (POST)", () => {
  it("onay yoksa / expected yoksa 400", async () => {
    expect((await post({ expected: "tr", to: "en" })).status).toBe(400);
    expect((await post({ to: "en", confirm: true })).status).toBe(400);
    expect(h.changeCalls).toEqual([]);
  });

  it("hatalı locale, kapalı dil, aynı dil, çoklu dil kapalı → 400; eski ana dil korunur", async () => {
    expect((await post({ expected: "tr", to: "xx", confirm: true })).status).toBe(400);
    h.rows = h.rows.map((r) => (r.code === "de" ? { ...r, is_enabled: false } : r));
    expect((await post({ expected: "tr", to: "de", confirm: true })).status).toBe(400);
    expect((await post({ expected: "tr", to: "tr", confirm: true })).status).toBe(400);
    h.settings.multilingual_enabled = false;
    expect((await post({ expected: "tr", to: "en", confirm: true })).status).toBe(400);
    expect(h.changeCalls).toEqual([]);
    expect(h.settings.public_default_locale).toBe("tr");
    expect(h.invalidate).not.toHaveBeenCalled();
  });

  for (const [from, to] of [
    ["tr", "en"],
    ["tr", "de"],
    ["en", "tr"],
    ["en", "de"],
    ["de", "tr"],
    ["de", "en"],
  ] as const) {
    it(`${from} → ${to}: atomik yazım, cache geçersiz kılma, geçiş kaydı`, async () => {
      h.settings.public_default_locale = from;
      const res = await post({ expected: from, to, confirm: true });
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json).toMatchObject({ ok: true, previous: from, current: to });
      expect(json.plan.issues).toEqual([]);
      expect(h.changeCalls).toEqual([[from, to]]);
      expect(h.settings.public_default_locale).toBe(to);
      expect(h.invalidate).toHaveBeenCalledTimes(1);
      expect(h.log).toHaveBeenCalledTimes(1);
      expect(h.log.mock.calls[0][1]).toMatchObject({
        action: "settings.root_locale_change",
        entity_type: "settings",
        before_data: { public_default_locale: from },
        after_data: { public_default_locale: to },
      });
    });
  }

  it("bayat expected → 409, DB çağrılmaz", async () => {
    const res = await post({ expected: "en", to: "de", confirm: true });
    expect(res.status).toBe(409);
    expect(h.changeCalls).toEqual([]);
  });

  it("eş zamanlı iki istek: biri kazanır, diğeri 409; son durum tutarlı", async () => {
    const [a, b] = await Promise.all([
      post({ expected: "tr", to: "en", confirm: true }),
      post({ expected: "tr", to: "de", confirm: true }),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);
    const winner = a.status === 200 ? "en" : "de";
    expect(h.settings.public_default_locale).toBe(winner);
    expect(h.invalidate).toHaveBeenCalledTimes(1);
    expect(h.log).toHaveBeenCalledTimes(1);
    const loser = await (a.status === 409 ? a : b).json();
    expect(loser).toMatchObject({ ok: false, code: "conflict", current: winner });
  });

  it("DB hatası → eski ana dil korunur, cache dokunulmaz, kayıt yazılmaz", async () => {
    h.changeImpl = async () => ({ data: null, error: { message: "Ana dil yalnız aktif bir dil olabilir (de)." } });
    const res = await post({ expected: "tr", to: "de", confirm: true });
    expect(res.status).toBe(400);
    expect(h.settings.public_default_locale).toBe("tr");
    expect(h.invalidate).not.toHaveBeenCalled();
    expect(h.log).not.toHaveBeenCalled();
  });

  it("migration 104 yok → 503", async () => {
    h.changeImpl = async () => ({
      data: null,
      error: { message: "function public.change_public_root_locale(text, text) does not exist" },
    });
    const res = await post({ expected: "tr", to: "en", confirm: true });
    expect(res.status).toBe(503);
    expect(h.invalidate).not.toHaveBeenCalled();
  });
});

describe("/api/admin/settings (genel form)", () => {
  const put = (body: unknown) =>
    putSettings(
      new Request("http://x/api/admin/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
    );

  it("ana dil genel formdan değiştirilemez (409), aynı değer serbest", async () => {
    expect((await put({ public_default_locale: "en" })).status).toBe(409);
    expect(h.updateById).not.toHaveBeenCalled();
    expect((await put({ public_default_locale: "tr", site_name: "x" })).status).toBe(200);
  });

  it("ana dil TR değilken çoklu dil kapatılamaz (409); açık bırakmak serbest", async () => {
    h.settings.public_default_locale = "en";
    expect((await put({ multilingual_enabled: false, public_default_locale: "en" })).status).toBe(409);
    expect(h.updateById).not.toHaveBeenCalled();
    expect((await put({ multilingual_enabled: true, public_default_locale: "en" })).status).toBe(200);
    expect(h.invalidate).not.toHaveBeenCalled();
  });

  it("çoklu dil değişince routing cache'leri geçersiz kılınır", async () => {
    expect((await put({ multilingual_enabled: false, public_default_locale: "tr" })).status).toBe(200);
    expect(h.invalidate).toHaveBeenCalledTimes(1);
  });
});
