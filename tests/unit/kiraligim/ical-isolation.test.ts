import { beforeEach, describe, expect, it, vi } from "vitest";

/* ===============================================================
   iCal regresyon + Kiraligim yalıtımı
   • iCal cron listesi yalnız source_type = 'kiraligim' satırlarını
     dışarıda bırakır; is_active filtresi aynen kalır.
   • syncExternalCalendarSource: kiraligim kaynağında feed ÇEKMEZ, hiçbir
     yazım yapmaz; iCal kaynağında eski akış (fetch) aynen çalışır.
=============================================================== */

type Call = { table: string; ops: Array<[string, unknown[]]> };
const calls: Call[] = [];

vi.mock("@/lib/db/native", () => {
  const builder = (table: string) => {
    const call: Call = { table, ops: [] };
    calls.push(call);
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "neq", "order", "update", "maybeSingle", "single", "in", "is", "limit"]) {
      b[m] = (...args: unknown[]) => {
        call.ops.push([m, args]);
        return b;
      };
    }
    b.then = (res: (v: unknown) => unknown) => res({ data: [], error: null });
    return b;
  };
  const db = { from: builder, rpc: vi.fn() };
  return { dbNative: db, dbAdminNative: db };
});

const sourceRow = vi.fn();
const updateById = vi.fn(async () => ({ error: null }));
const validateExternalUrl = vi.fn(async () => ({ ok: false, error: "blocked" }));

describe("iCal cron listesi", () => {
  it("is_active=true ve source_type <> 'kiraligim' (başka hiçbir değer dışlanmaz)", async () => {
    const { externalCalendarSourceServerRepository } = await import(
      "@/lib/db/external-calendar-source.repository.server"
    );
    calls.length = 0;
    await externalCalendarSourceServerRepository.findActiveIds();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.table).toBe("external_calendar_sources");
    expect(calls[0]!.ops).toEqual([
      ["select", ["id"]],
      ["eq", ["is_active", true]],
      ["neq", ["source_type", "kiraligim"]],
    ]);
  });
});

describe("syncExternalCalendarSource", () => {
  beforeEach(() => {
    vi.resetModules();
    sourceRow.mockReset();
    updateById.mockClear();
    validateExternalUrl.mockClear();
    vi.doMock("@/lib/db/external-calendar-source.repository.server", () => ({
      externalCalendarSourceServerRepository: {
        findForSync: async () => ({ data: sourceRow(), error: null }),
        updateById,
      },
    }));
    vi.doMock("@/lib/db/external-calendar-event.repository.server", () => ({
      externalCalendarEventServerRepository: new Proxy(
        {},
        {
          get: () => () => {
            throw new Error("event repository must not be called");
          },
        },
      ),
    }));
    vi.doMock("@/lib/security/ssrf.server", () => ({ validateExternalUrl }));
  });

  it("kiraligim kaynağı: feed çekilmez, kaynak/etkinlik yazılmaz", async () => {
    sourceRow.mockReturnValue({
      id: "s1",
      villa_id: "v1",
      source_name: "Kiraligim API",
      source_type: "kiraligim",
      ical_url: "https://app.kiraligim.com/#kiraligim-api",
      is_active: true,
    });
    const { syncExternalCalendarSource } = await import("@/app/services/external-calendar.service");
    const r = await syncExternalCalendarSource("s1");
    expect(r).toMatchObject({ ok: false, stage: "fetch" });
    expect(validateExternalUrl).not.toHaveBeenCalled();
    expect(updateById).not.toHaveBeenCalled();
  });

  it("iCal kaynağı: eski akış aynen (feed adımına geçilir)", async () => {
    sourceRow.mockReturnValue({
      id: "s2",
      villa_id: "v1",
      source_name: "Airbnb",
      source_type: "ical",
      ical_url: "https://www.airbnb.com/calendar/ical/1.ics",
      is_active: true,
    });
    const { syncExternalCalendarSource } = await import("@/app/services/external-calendar.service");
    await syncExternalCalendarSource("s2");
    expect(validateExternalUrl).toHaveBeenCalledTimes(1);
  });

  it("source_type alanı gelmeyen eski satır iCal gibi davranır", async () => {
    sourceRow.mockReturnValue({
      id: "s3",
      villa_id: "v1",
      source_name: "Booking",
      ical_url: "https://admin.booking.com/x.ics",
      is_active: true,
    });
    const { syncExternalCalendarSource } = await import("@/app/services/external-calendar.service");
    await syncExternalCalendarSource("s3");
    expect(validateExternalUrl).toHaveBeenCalledTimes(1);
  });
});
