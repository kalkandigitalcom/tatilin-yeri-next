/* ===============================================================
   🛡️ /maki-admin/external-reservations — pasif ⇄ aktif geçişleri
   ===============================================================
   Gerçek route'lar (deactivate + activate) ve gerçek sync
   (syncExternalCalendarSource) bellek-içi tabloya karşı çalıştırılır:
     • aktif → pasif (manually_deactivated=true), sync geri açmaz
     • pasif → aktif (bayrak temizlenir), sync tekrar kapatmaz
     • feed'den düşen (stale) pasif satır elle açılamaz (409)
     • geçmiş satır 409, yok 404, izinsiz 403, idempotent aktif
=============================================================== */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type Row = {
  id: string;
  source_id: string;
  villa_id: string;
  external_uid: string;
  start_date: string;
  end_date: string;
  summary: string | null;
  is_active: boolean;
  manually_deactivated: boolean;
  last_seen_at: string;
  created_at: string;
  updated_at?: string;
};
const db = { rows: [] as Row[], seq: 0 };
const logs: Array<Record<string, unknown>> = [];
const auth = { ok: true, allowed: true };

const pick = (r: Row, cols: string[]) =>
  Object.fromEntries(cols.map((c) => [c, (r as Record<string, unknown>)[c]]));

vi.mock("@/lib/db/external-calendar-event.repository.server", () => ({
  externalCalendarEventServerRepository: {
    async findByIdForDeactivate(id: string) {
      const r = db.rows.find((x) => x.id === id);
      /* gerçek SELECT'te manually_deactivated YOK */
      return {
        data: r
          ? pick(r, ["id", "villa_id", "source_id", "external_uid", "start_date", "end_date", "summary", "is_active"])
          : null,
        error: null,
      };
    },
    async findByIdForActivate(id: string) {
      const r = db.rows.find((x) => x.id === id);
      return { data: r ? { ...r } : null, error: null };
    },
    async updateById(id: string, patch: Record<string, unknown>) {
      const r = db.rows.find((x) => x.id === id);
      if (r) Object.assign(r, patch);
      return { error: null };
    },
    async reactivateManualById(id: string, at: string) {
      const hit = db.rows.filter((x) => x.id === id && x.manually_deactivated);
      hit.forEach((r) => Object.assign(r, { is_active: true, manually_deactivated: false, updated_at: at }));
      return { data: hit.map((r) => ({ id: r.id })), error: null };
    },
    async upsertByVillaUid(rows: Array<Record<string, unknown>>) {
      const ids: { id: string }[] = [];
      for (const r of rows) {
        const hit = db.rows.find((x) => x.villa_id === r.villa_id && x.external_uid === r.external_uid);
        if (hit) {
          Object.assign(hit, r);
          ids.push({ id: hit.id });
        } else {
          const row = { id: `ev-${++db.seq}`, manually_deactivated: false, created_at: String(r.last_seen_at), ...r } as unknown as Row;
          db.rows.push(row);
          ids.push({ id: row.id });
        }
      }
      return { data: ids, error: null };
    },
    async deactivateManualOverrideBySource(sourceId: string) {
      for (const r of db.rows)
        if (r.source_id === sourceId && r.manually_deactivated && r.is_active) r.is_active = false;
      return { error: null };
    },
    async deletePastBySource(sourceId: string, today: string) {
      const del = db.rows.filter((r) => r.source_id === sourceId && r.end_date < today);
      db.rows = db.rows.filter((r) => !del.includes(r));
      return { data: del.map((r) => ({ id: r.id })), error: null };
    },
    async deactivateStaleBySource(sourceId: string, _at: string, seen: string[]) {
      const hit = db.rows.filter((r) => r.source_id === sourceId && r.is_active && !seen.includes(r.external_uid));
      hit.forEach((r) => (r.is_active = false));
      return { data: hit.map((r) => ({ id: r.id })), error: null };
    },
  },
}));

const SOURCE = { id: "src-1", villa_id: "villa-1", source_name: "Airbnb", ical_url: "https://example.com/cal.ics", is_active: true };
vi.mock("@/lib/db/external-calendar-source.repository.server", () => ({
  externalCalendarSourceServerRepository: {
    findForSync: async () => ({ data: SOURCE, error: null }),
    updateById: async () => ({ error: null }),
    findSourceNameById: async () => ({ data: { source_name: "Airbnb" }, error: null }),
  },
}));
vi.mock("@/lib/db/villa.repository.server", () => ({
  villaAdminRepository: { findTitleById: async () => ({ data: { title: "Villa Test" }, error: null }) },
}));
vi.mock("@/lib/security/ssrf.server", () => ({
  validateExternalUrl: async (u: string) => ({ ok: true, url: new URL(u) }),
}));
vi.mock("@/lib/admin-route-auth", () => ({
  authorizeAdminCaller: async () =>
    auth.ok ? { ok: true, caller: { id: "admin-1", email: "a@x" } } : { ok: false, status: 401, error: "Yetkisiz" },
}));
vi.mock("@/lib/auth/action-authz", () => ({
  FORBIDDEN_MESSAGE: "Yetkisiz: bu işlem için izniniz yok",
  callerHasPermission: async () => auth.allowed,
}));
vi.mock("@/app/services/admin-activity-log.service", () => ({
  extractAdminContextFromRequest: () => ({}),
  insertAdminActivityLog: async (_c: unknown, input: Record<string, unknown>) => {
    logs.push(input);
  },
}));

let feed: Array<{ uid: string; start: string; end: string }> = [];
const ics = () =>
  `BEGIN:VCALENDAR\nVERSION:2.0\n${feed
    .map((e) => `BEGIN:VEVENT\nUID:${e.uid}\nDTSTART;VALUE=DATE:${e.start.replace(/-/g, "")}\nDTEND;VALUE=DATE:${e.end.replace(/-/g, "")}\nSUMMARY:Reserved\nEND:VEVENT`)
    .join("\n")}\nEND:VCALENDAR`;

import { syncExternalCalendarSource } from "@/app/services/external-calendar.service";
import { POST as deactivatePOST } from "@/app/api/admin/external-calendars/events/[id]/deactivate/route";
import { POST as activatePOST } from "@/app/api/admin/external-calendars/events/[id]/activate/route";

type RouteFn = (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
const call = async (fn: RouteFn, id: string) => {
  const res = await fn(new Request(`http://localhost/api/x/${id}`, { method: "POST" }), {
    params: Promise.resolve({ id }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};
const sync = async () => {
  const r = await syncExternalCalendarSource(SOURCE.id);
  if (!r.ok) throw new Error(`sync failed: ${r.stage} ${r.error}`);
  return r;
};
const row = (uid: string) => db.rows.find((r) => r.external_uid === uid)!;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-06T10:00:00Z"));
  db.rows = [];
  db.seq = 0;
  logs.length = 0;
  auth.ok = true;
  auth.allowed = true;
  feed = [{ uid: "f1", start: "2027-01-02", end: "2027-01-05" }];
  vi.stubGlobal("fetch", vi.fn(async () => new Response(ics(), { status: 200 })));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("aktif → pasif → aktif (gerçek route + sync)", () => {
  it("pasifleştirme kalıcı; aktifleştirme bayrağı temizler ve sync sonrası aktif kalır", async () => {
    await sync();
    const id = row("f1").id;
    expect(row("f1").is_active).toBe(true);

    /* aktif → pasif */
    const d = await call(deactivatePOST, id);
    expect(d.status).toBe(200);
    expect(row("f1")).toMatchObject({ is_active: false, manually_deactivated: true });
    await sync();
    expect(row("f1").is_active).toBe(false); /* sync geri açmaz (mevcut davranış) */

    /* pasif → aktif */
    const a = await call(activatePOST, id);
    expect(a).toEqual({ status: 200, body: { ok: true, id, already_active: false } });
    expect(row("f1")).toMatchObject({ is_active: true, manually_deactivated: false });
    expect(logs.at(-1)).toMatchObject({ action: "external_calendar_event.activated", entity_id: id });

    /* sync artık tekrar KAPATMAZ (feed'de duruyor) */
    await sync();
    expect(row("f1").is_active).toBe(true);
    expect(db.rows).toHaveLength(1);

    /* tekrar pasif → tekrar aktif (döngü tekrarlanabilir) */
    expect((await call(deactivatePOST, id)).status).toBe(200);
    expect(row("f1").is_active).toBe(false);
    expect((await call(activatePOST, id)).status).toBe(200);
    expect(row("f1").is_active).toBe(true);
  });

  it("aktifleştirilen event feed'den düşerse normal stale akışıyla pasife iner", async () => {
    await sync();
    const id = row("f1").id;
    await call(deactivatePOST, id);
    await call(activatePOST, id);
    feed = [];
    const r = await sync();
    expect(r.deactivated).toBe(1);
    expect(row("f1")).toMatchObject({ is_active: false, manually_deactivated: false });
  });

  it("zaten aktif → idempotent 200 already_active, UPDATE/log yok", async () => {
    await sync();
    const a = await call(activatePOST, row("f1").id);
    expect(a).toEqual({ status: 200, body: { ok: true, id: row("f1").id, already_active: true } });
    expect(logs).toHaveLength(0);
  });
});

describe("activate korumaları", () => {
  it("feed'den düştüğü için sync'in pasifleştirdiği satır elle açılmaz (409), satır değişmez", async () => {
    await sync();
    feed = [];
    await sync();
    const before = { ...row("f1") };
    const a = await call(activatePOST, row("f1").id);
    expect(a.status).toBe(409);
    expect(String(a.body.error)).toContain("senkronizasyon");
    expect(row("f1")).toEqual(before);
  });

  it("geçmiş tarihli manuel-pasif satır 409", async () => {
    db.rows.push({
      id: "old", source_id: "src-1", villa_id: "villa-1", external_uid: "old",
      start_date: "2026-09-01", end_date: "2026-09-03", summary: null,
      is_active: false, manually_deactivated: true, last_seen_at: "x", created_at: "x",
    });
    const a = await call(activatePOST, "old");
    expect(a.status).toBe(409);
    expect(db.rows[0].is_active).toBe(false);
  });

  it("bulunamayan 404; izinsiz 403; oturumsuz 401 — hiçbir satır değişmez", async () => {
    await sync();
    await call(deactivatePOST, row("f1").id);
    expect((await call(activatePOST, "yok")).status).toBe(404);
    auth.allowed = false;
    expect((await call(activatePOST, row("f1").id)).status).toBe(403);
    auth.allowed = true;
    auth.ok = false;
    expect((await call(activatePOST, row("f1").id)).status).toBe(401);
    expect(row("f1")).toMatchObject({ is_active: false, manually_deactivated: true });
  });
});
