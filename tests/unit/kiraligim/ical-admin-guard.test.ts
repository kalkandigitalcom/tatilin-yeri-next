import { beforeEach, describe, expect, it, vi } from "vitest";

/* ===============================================================
   iCal admin uçları — Kiraligim kayıtları elle değiştirilemez
   (aç / kapat / kalıcı temizle / kaynak aç-kapa / URL). Koruma 409
   döner ve HİÇBİR repository yazımı yapılmaz. iCal kayıtlarındaki
   mevcut davranış tests/unit/external-calendar-event-activate.test.ts
   ile korunur.
=============================================================== */
const KG_EVENT = "0198f3a0-0000-7000-8000-00000000000e";
const KG_SOURCE = "0198f3a0-0000-7000-8000-00000000000s".replace("s", "5");
const writes: string[] = [];

vi.mock("@/lib/plugins/kiraligim/guard.server", () => ({
  KIRALIGIM_MANAGED_MESSAGE: "Bu kayıt Kiraligim'den gelir ve yalnız Kiraligim üzerinden değiştirilebilir.",
  isKiraligimEvent: async (id: string) => id === KG_EVENT,
  isKiraligimSource: async (id: string) => id === KG_SOURCE,
}));
const repoProxy = (name: string) =>
  new Proxy(
    {},
    {
      get: (_t, prop) => async () => {
        writes.push(`${name}.${String(prop)}`);
        return { data: null, error: null };
      },
    },
  );
vi.mock("@/lib/db/external-calendar-event.repository.server", () => ({
  externalCalendarEventServerRepository: repoProxy("eventServer"),
}));
vi.mock("@/lib/db/external-calendar-source.repository.server", () => ({
  externalCalendarSourceServerRepository: repoProxy("sourceServer"),
}));
vi.mock("@/lib/db/external-calendar-source.repository", () => ({
  externalCalendarSourceRepository: repoProxy("source"),
}));
vi.mock("@/lib/db/external-calendar-event.repository", () => ({
  externalCalendarEventRepository: repoProxy("event"),
}));
vi.mock("@/lib/db/villa.repository.server", () => ({ villaAdminRepository: repoProxy("villa") }));
vi.mock("@/lib/admin-route-auth", () => ({
  authorizeAdminCaller: async () => ({ ok: true, caller: { id: "admin-1", email: "a@x" } }),
}));
vi.mock("@/lib/auth/action-authz", () => ({
  FORBIDDEN_MESSAGE: "Yetkisiz",
  callerHasPermission: async () => true,
}));
vi.mock("@/app/services/admin-activity-log.service", () => ({
  extractAdminContextFromRequest: () => ({}),
  insertAdminActivityLog: async () => {
    writes.push("activityLog");
  },
}));

const post = async (mod: string, id: string) => {
  const { POST } = (await import(mod)) as {
    POST: (r: Request, c: { params: Promise<{ id: string }> }) => Promise<Response>;
  };
  return POST(new Request(`http://localhost/x/${id}`, { method: "POST" }), { params: Promise.resolve({ id }) });
};

beforeEach(() => {
  writes.length = 0;
});

describe("Kiraligim kayıtları — iCal admin uçları", () => {
  it("etkinlik pasifleştir / aktifleştir → 409, yazım yok", async () => {
    for (const mod of [
      "@/app/api/admin/external-calendars/events/[id]/deactivate/route",
      "@/app/api/admin/external-calendars/events/[id]/activate/route",
    ]) {
      const res = await post(mod, KG_EVENT);
      expect(res.status).toBe(409);
      expect((await res.json()).error).toMatch(/Kiraligim/);
    }
    expect(writes).toEqual([]);
  });

  it("kaynak kalıcı temizle → 409, yazım yok", async () => {
    const res = await post("@/app/api/admin/external-calendars/sources/[id]/purge-inactive/route", KG_SOURCE);
    expect(res.status).toBe(409);
    expect(writes).toEqual([]);
  });

  it("kaynak aç-kapa ve URL değiştir → hata, yazım yok; iCal kaynağı servise ulaşır", async () => {
    const svc = await import("@/app/services/external-calendar-source.service");
    expect(await svc.setExternalCalendarSourceActive(KG_SOURCE, false)).toMatchObject({ ok: false });
    expect(await svc.updateExternalCalendarSourceUrl(KG_SOURCE, "https://www.airbnb.com/x.ics")).toMatchObject({ ok: false });
    expect(writes).toEqual([]);
    await svc.setExternalCalendarSourceActive("0198f3a0-0000-7000-8000-0000000000aa", false);
    expect(writes).toEqual(["source.updateById"]);
  });

  it("iCal etkinliği koruma dışında: route normal akışa (repository) devam eder", async () => {
    await post("@/app/api/admin/external-calendars/events/[id]/deactivate/route", "0198f3a0-0000-7000-8000-0000000000bb");
    expect(writes[0]).toBe("eventServer.findByIdForDeactivate");
  });
});
