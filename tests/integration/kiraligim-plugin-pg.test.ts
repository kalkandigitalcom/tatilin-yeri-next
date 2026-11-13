import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { KiraligimApiError, type KiraligimClient } from "@/lib/plugins/kiraligim/core/client.server";
import { applyChange, normalizeRanges } from "@/lib/plugins/kiraligim/core/ranges";
import { signKiraligimWebhook } from "@/lib/plugins/kiraligim/core/webhook-verify";
import type { BusyRange, KiraligimConnectionStatus } from "@/lib/plugins/kiraligim/core/types";
import { isKiraligimEvent, isKiraligimSource } from "@/lib/plugins/kiraligim/guard.server";
import {
  findConflicts,
  findDuplicateFeeds,
  getSettings,
  listConnections,
  replaceBusy,
  updateSettings,
  withTx,
} from "@/lib/plugins/kiraligim/store.server";
import {
  connectVilla,
  disconnectVilla,
  pull,
  refreshConnectionStatus,
  runScheduledSync,
  snapshotConnection,
  type KiraligimDeps,
} from "@/lib/plugins/kiraligim/sync.server";
import { receiveWebhook, registerWebhook } from "@/lib/plugins/kiraligim/webhook.server";

/* ===============================================================
   Kiraligim eklentisi — gerçek PostgreSQL entegrasyon testi
   ===============================================================
   KIRALIGIM_PG_ADMIN_URL (yerel/geçici PostgreSQL süper kullanıcı adresi)
   verilmezse ATLANIR. Test kendi geçici veritabanını oluşturur, ilgili
   şemayı repodaki migration dosyalarından kurar (029 arşiv + 031 + 032 +
   109) ve sonunda siler. Production'a hiçbir şekilde bağlanmaz.
   Kiraligim API'si bellek içi sahte sunucuyla taklit edilir (sözleşme:
   kiraligim-next docs/api/openapi.yaml).
=============================================================== */

const ADMIN_URL = process.env.KIRALIGIM_PG_ADMIN_URL;
const d = ADMIN_URL ? describe : describe.skip;

const D = (n: number) => new Date(Date.UTC(2027, 6, 1) + n * 86_400_000).toISOString().slice(0, 10);
const R = (a: number, b: number): BusyRange => ({ start_date: D(a), end_date: D(b) });

/* ---------------- sahte Kiraligim API ---------------- */
class FakeKiraligim {
  props = new Map<string, { name: string; busy: BusyRange[] }>();
  conns = new Map<
    string,
    { property_id: string; external: string; status: KiraligimConnectionStatus; snap: number | null }
  >();
  log: { id: number; property_id: string; start_date: string; end_date: string; busy: BusyRange[] }[] = [];
  lastId = 0;
  expired = false;
  webhookSecret: string | null = null;
  calls: string[] = [];

  addProperty(name: string, busy: BusyRange[] = []) {
    const id = randomUUID();
    this.props.set(id, { name, busy: normalizeRanges(busy) });
    return id;
  }
  change(propertyId: string, s: number, e: number, busy: BusyRange[]) {
    const p = this.props.get(propertyId)!;
    const ch = { start_date: D(s), end_date: D(e), busy_dates: busy };
    p.busy = applyChange(p.busy, ch);
    this.log.push({ id: ++this.lastId, property_id: propertyId, start_date: ch.start_date, end_date: ch.end_date, busy });
  }
  conn(id: string) {
    const c = this.conns.get(id);
    if (!c) throw new KiraligimApiError(404, "not_found");
    return c;
  }
  view(id: string) {
    const c = this.conn(id);
    return {
      id,
      property_id: c.property_id,
      external_property_id: c.external,
      status: c.status,
      created_at: "",
      ended_at: null,
      last_synced_at: null,
    };
  }
  client(): KiraligimClient {
    return fakeClient(this);
  }
}

function fakeClient(f: FakeKiraligim): KiraligimClient {
  {
    return {
      me: async () => ({ id: "acc", name: "Tatilin Yeri", rate_limit: { limit: 120, window_seconds: 60 } }),
      properties: async () => [...f.props].map(([id, p]) => ({ id, name: p.name })),
      connect: async (propertyId: string, external: string) => {
        f.calls.push("connect");
        for (const [id, c] of f.conns) {
          if (c.property_id === propertyId && (c.status === "active" || c.status === "paused")) {
            if (c.external !== external) throw new KiraligimApiError(409, "already_connected");
            return { status: 200, data: f.view(id) };
          }
        }
        if (!f.props.has(propertyId)) throw new KiraligimApiError(404, "not_found");
        const id = randomUUID();
        f.conns.set(id, { property_id: propertyId, external, status: "active", snap: null });
        return { status: 201, data: f.view(id) };
      },
      connection: async (id: string) => f.view(id),
      disconnect: async (id: string) => {
        f.conn(id).status = "disconnected";
        return f.view(id);
      },
      snapshot: async (id: string) => {
        f.calls.push("snapshot");
        const c = f.conn(id);
        if (c.status !== "active") throw new KiraligimApiError(404, "not_found");
        c.snap = f.lastId;
        return {
          connection_id: id,
          property_id: c.property_id,
          external_property_id: c.external,
          from: D(-366),
          to: D(731),
          busy_dates: f.props.get(c.property_id)!.busy,
          cursor: `c1.${id}.${f.lastId}`,
        };
      },
      accountChanges: async (cursor: string | null, limit = 200) => {
        f.calls.push(`changes:${cursor ?? "null"}`);
        if (cursor === null) return { changes: [], next_cursor: `a1.${f.lastId}`, has_more: false };
        if (f.expired) throw new KiraligimApiError(410, "cursor_expired");
        const from = Number(cursor.split(".")[1]);
        const out = [];
        let last = from;
        for (const ch of f.log.filter((x) => x.id > from)) {
          let added = false;
          for (const [cid, c] of f.conns) {
            if (c.property_id !== ch.property_id || c.status !== "active" || c.snap === null || ch.id <= c.snap) continue;
            out.push({
              change_id: String(ch.id),
              connection_id: cid,
              property_id: c.property_id,
              external_property_id: c.external,
              start_date: ch.start_date,
              end_date: ch.end_date,
              busy_dates: ch.busy,
            });
            added = true;
          }
          if (out.length > limit) break;
          last = ch.id;
          void added;
        }
        const more = out.length > limit;
        const page = out.slice(0, limit);
        const next = more ? Number(page[page.length - 1]!.change_id) : Math.max(last, f.lastId);
        return { changes: more ? page.filter((x) => Number(x.change_id) <= next) : page, next_cursor: `a1.${next}`, has_more: more };
      },
      webhook: async () => ({ url: "", created_at: "", updated_at: "", secret_rotated_at: null }),
      putWebhook: async (url: string) => {
        const created = f.webhookSecret === null;
        if (created) f.webhookSecret = `whsec_${randomBytes(32).toString("base64url")}`;
        return {
          status: created ? 201 : 200,
          data: { url, created_at: "", updated_at: "", secret_rotated_at: null, ...(created ? { secret: f.webhookSecret! } : {}) },
        };
      },
      deleteWebhook: async () => {
        f.webhookSecret = null;
        return { deleted: true as const };
      },
      rotateWebhookSecret: async () => {
        f.webhookSecret = `whsec_${randomBytes(32).toString("base64url")}`;
        return { secret: f.webhookSecret, secret_rotated_at: "" };
      },
    } as unknown as KiraligimClient;
  }
}

d("Kiraligim eklentisi (PostgreSQL)", () => {
  const dbName = `kg_plugin_${randomBytes(4).toString("hex")}`;
  let admin: pg.Client;
  let pool: pg.Pool;
  let fake: FakeKiraligim;
  let deps: KiraligimDeps;
  let villaA: string, villaB: string, villaC: string;
  let icalSource: string;

  const q = (sql: string, params?: unknown[]) => pool.query(sql, params);
  const busyOf = async (villaId: string) =>
    (
      await q(
        `select e.start_date::text s, e.end_date::text e from external_calendar_events e
           join external_calendar_sources s on s.id = e.source_id
          where e.villa_id = $1 and s.source_type = 'kiraligim' and e.is_active order by 1`,
        [villaId],
      )
    ).rows.map((r) => ({ start_date: r.s, end_date: r.e }));

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`create database ${dbName}`);
    const u = new URL(ADMIN_URL!);
    u.pathname = `/${dbName}`;
    pool = new pg.Pool({ connectionString: u.toString(), max: 6 });
    // Projede şema baseline'ı yok: ilgili tablolar minimal kurulur, harici
    // takvim ve çakışma tetikleyicisi repodaki migration'lardan uygulanır.
    await q(`
      create table public.villa (id uuid primary key default gen_random_uuid(), title text,
                                 is_active boolean default true, deleted_at timestamptz);
      create table public.reservations (id uuid primary key default gen_random_uuid(), villa_id uuid not null,
                                        start_date date not null, end_date date not null, status text);
      create table public.manual_reservations (id uuid primary key default gen_random_uuid(), villa_id uuid not null,
                                               start_date date not null, end_date date not null);
      create table public.admin_users (id uuid primary key default gen_random_uuid(), is_active boolean default true,
                                       sidebar_permissions jsonb);
    `);
    await q(readFileSync("db/migrations/_archive/legacy/029_external_calendar_sync.sql", "utf8"));
    await q(`alter table public.external_calendar_sources add column if not exists last_event_count integer`);
    await q(readFileSync("db/migrations/031_external_calendar_overlap_trigger.sql", "utf8"));
    await q(readFileSync("db/migrations/032_external_calendar_events_manual_override.sql", "utf8"));
    await q(`insert into admin_users (sidebar_permissions) values ('["settings","villas"]'), ('["villas"]'), (null)`);
    await q(readFileSync("db/migrations/109_kiraligim_plugin.sql", "utf8"));
    villaA = (await q(`insert into villa (title) values ('Villa A') returning id`)).rows[0].id;
    villaB = (await q(`insert into villa (title) values ('Villa B') returning id`)).rows[0].id;
    villaC = (await q(`insert into villa (title) values ('Villa C') returning id`)).rows[0].id;
    icalSource = (
      await q(
        `insert into external_calendar_sources (villa_id, source_name, ical_url)
         values ($1, 'Airbnb', 'https://www.airbnb.com/calendar/ical/1.ics') returning id`,
        [villaA],
      )
    ).rows[0].id;
    await q(
      `insert into external_calendar_events (source_id, villa_id, external_uid, start_date, end_date)
       values ($1, $2, 'airbnb-1', $3, $4)`,
      [icalSource, villaA, D(100), D(103)],
    );
  });

  afterAll(async () => {
    await pool?.end();
    await admin?.query(`drop database if exists ${dbName} with (force)`);
    await admin?.end();
  });

  beforeEach(() => {
    fake ??= new FakeKiraligim();
    deps = { db: pool, client: fake.client() };
  });

  it("migration 109: idempotent; yalnız 'settings' iznine sahip adminlere 'plugins'", async () => {
    await q(readFileSync("db/migrations/109_kiraligim_plugin.sql", "utf8"));
    const perms = (await q(`select sidebar_permissions p from admin_users order by sidebar_permissions::text nulls last`)).rows.map((r) => r.p);
    expect(perms).toContainEqual(["settings", "villas", "plugins"]);
    expect(perms).toContainEqual(["villas"]);
    expect(perms).toContainEqual(null);
    expect((await q(`select count(*)::int n from kiraligim_settings`)).rows[0].n).toBe(1);
  });

  it("bağlama: kiraligim kaynağı + snapshot dolulukları; iCal kaynağı ve etkinliği değişmez", async () => {
    const pA = fake.addProperty("K Villa A", [R(10, 14), R(14, 16), R(30, 32)]);
    const r = await connectVilla(deps, { propertyId: pA, propertyName: "K Villa A", villaId: villaA });
    expect(r).toMatchObject({ ok: true, busy: 2 });
    // Hesap cursor'ı snapshot'tan ÖNCE alınmış olmalı.
    const order = fake.calls.filter((c) => c === "snapshot" || c.startsWith("changes:"));
    expect(order.slice(0, 2)).toEqual(["changes:null", "snapshot"]);
    expect(await busyOf(villaA)).toEqual([R(10, 16), R(30, 32)]);
    const src = (await q(`select source_type, source_name, is_active from external_calendar_sources where villa_id = $1 order by created_at`, [villaA])).rows;
    expect(src).toEqual([
      { source_type: "ical", source_name: "Airbnb", is_active: true },
      { source_type: "kiraligim", source_name: "Kiraligim API", is_active: true },
    ]);
    const ical = (await q(`select external_uid, start_date::text s from external_calendar_events where source_id = $1`, [icalSource])).rows;
    expect(ical).toEqual([{ external_uid: "airbnb-1", s: D(100) }]);
    const [conn] = await listConnections(pool);
    expect(conn).toMatchObject({ villa_id: villaA, property_id: pA, status: "active", busy_count: 2 });
    // Kiraligim'e giden acente kimliği yerel villa kimliğidir.
    expect([...fake.conns.values()][0]!.external).toBe(villaA);
  });

  it("çakışma tetikleyicisi (031) Kiraligim dolulukları için de çalışır; rezervasyon tablosuna yazılmadı", async () => {
    expect((await q(`select count(*)::int n from reservations`)).rows[0].n).toBe(0);
    await expect(
      q(`insert into reservations (villa_id, start_date, end_date, status) values ($1, $2, $3, 'pending')`, [villaA, D(11), D(13)]),
    ).rejects.toMatchObject({ code: "23P01" });
    await q(`insert into reservations (villa_id, start_date, end_date, status) values ($1, $2, $3, 'pending')`, [villaA, D(16), D(18)]);
    await expect(
      q(`insert into manual_reservations (villa_id, start_date, end_date) values ($1, $2, $3)`, [villaA, D(31), D(33)]),
    ).rejects.toMatchObject({ code: "23P01" });
  });

  it("hesap akışı: sayfalı, sıralı; cursor veriyle aynı transaction'da; yeniden uygulama sonucu değiştirmez", async () => {
    const pA = [...fake.props.keys()][0]!;
    fake.change(pA, 0, 40, [R(5, 7), R(10, 16)]); // 30-32 açıldı, 5-7 kapandı
    fake.change(pA, 18, 25, [R(20, 22)]);
    fake.change(pA, 20, 22, []); // 20-22 tekrar açıldı
    const before = await getSettings(pool);
    const s = await pull({ db: pool, client: (() => {
      const c = fake.client();
      return { ...c, accountChanges: (cur: string | null) => c.accountChanges(cur, 1) } as KiraligimClient;
    })() });
    expect(s).toMatchObject({ locked: true, applied: 3, skipped: 0, errorCode: null });
    expect(s.pages).toBeGreaterThanOrEqual(3);
    const expected = fake.props.get(pA)!.busy;
    expect(await busyOf(villaA)).toEqual(expected);
    const after = await getSettings(pool);
    expect(after.account_cursor).not.toBe(before.account_cursor);
    // Kesinti senaryosu: eski cursor'a dönüp aynı değişiklikleri yeniden uygula.
    await updateSettings(pool, { account_cursor: before.account_cursor });
    await pull(deps);
    expect(await busyOf(villaA)).toEqual(expected);
  });

  it("aynı anda iki senkron: biri kilidi alamaz", async () => {
    const [a, b] = await Promise.all([pull(deps), pull(deps)]);
    expect([a.locked, b.locked].sort()).toEqual([false, true]);
  });

  it("çift besleme ve çakışma raporları (salt okuma)", async () => {
    const pB = fake.addProperty("K Villa B", [R(50, 55)]);
    await connectVilla(deps, { propertyId: pB, propertyName: "K Villa B", villaId: villaB });
    await q(
      `insert into external_calendar_sources (villa_id, source_name, ical_url)
       values ($1, 'Kiraligim iCal', 'https://app.kiraligim.com/ical/abc.ics')`,
      [villaB],
    );
    const dups = await findDuplicateFeeds(pool);
    expect(dups.map((x) => [x.villa_id, x.source_name])).toEqual([[villaB, "Kiraligim iCal"]]);
    // Önceden var olan rezervasyonla çakışan yeni Kiraligim doluluğu → rapor.
    await q(`insert into reservations (villa_id, start_date, end_date, status) values ($1, $2, $3, 'confirmed')`, [villaB, D(60), D(63)]);
    fake.change(pB, 58, 65, [R(59, 61)]);
    await pull(deps);
    const conflicts = await findConflicts(pool);
    expect(conflicts.some((c) => c.villa_id === villaB && c.kind === "reservation" && c.start_date === D(60))).toBe(true);
    expect((await q(`select count(*)::int n from reservations where villa_id = $1`, [villaB])).rows[0].n).toBe(1);
  });

  it("koruma: kiraligim kaynağı/etkinliği tanınır, iCal kayıtları tanınmaz", async () => {
    const k = (await q(`select id from external_calendar_sources where source_type = 'kiraligim' limit 1`)).rows[0].id;
    const ke = (await q(`select id from external_calendar_events where source_id = $1 limit 1`, [k])).rows[0].id;
    const ie = (await q(`select id from external_calendar_events where source_id = $1 limit 1`, [icalSource])).rows[0].id;
    expect(await isKiraligimSource(k, pool)).toBe(true);
    expect(await isKiraligimSource(icalSource, pool)).toBe(false);
    expect(await isKiraligimEvent(ke, pool)).toBe(true);
    expect(await isKiraligimEvent(ie, pool)).toBe(false);
    expect(await isKiraligimEvent("not-a-uuid", pool)).toBe(false);
    // Yanlış kaynak kimliğiyle iCal etkinliklerine asla yazılmaz.
    await expect(withTx(pool, (c) => replaceBusy(c, icalSource, villaA, []))).rejects.toThrow("kiraligim_source_mismatch");
    expect((await q(`select count(*)::int n from external_calendar_events where source_id = $1`, [icalSource])).rows[0].n).toBe(1);
  });

  it("duraklatma: dolulukları korur; yeniden etkinleşince tam pencere değişikliği uygulanır", async () => {
    const [cid, c] = [...fake.conns].find(([, x]) => x.external === villaB)!;
    const keep = await busyOf(villaB);
    c.status = "paused";
    expect(await snapshotConnection(deps, cid)).toEqual({ ok: false, code: "connection_paused" });
    expect(await busyOf(villaB)).toEqual(keep);
    expect((await listConnections(pool)).find((x) => x.id === cid)!.status).toBe("paused");
    // Kiraligim: villa yeniden etkin → tam pencere değişikliği
    c.status = "active";
    fake.change(c.property_id, -366, 731, [R(70, 72)]);
    await pull(deps);
    expect(await busyOf(villaB)).toEqual([R(70, 72)]);
    expect((await listConnections(pool)).find((x) => x.id === cid)!.status).toBe("active");
  });

  it("410 cursor_expired: yeni cursor + bütün güncel bağlantılar için snapshot", async () => {
    const pA = [...fake.props.keys()][0]!;
    fake.props.get(pA)!.busy = [R(1, 2)]; // değişiklik kaydı olmadan merkezde değişti
    fake.expired = true;
    const s = await pull(deps);
    fake.expired = false;
    expect(s.resnapshotted).toBe(2);
    expect(await busyOf(villaA)).toEqual([R(1, 2)]);
  });

  it("acente bağlantıyı keser: Kiraligim dolulukları kalkar, kaynak pasif, iCal sağlam", async () => {
    const cid = [...fake.conns].find(([, x]) => x.external === villaA)![0];
    expect(await disconnectVilla(deps, cid)).toEqual({ ok: true });
    expect(await busyOf(villaA)).toEqual([]);
    const src = (await q(`select is_active from external_calendar_sources where villa_id = $1 and source_type = 'kiraligim'`, [villaA])).rows[0];
    expect(src.is_active).toBe(false);
    expect((await q(`select count(*)::int n from external_calendar_events where source_id = $1 and is_active`, [icalSource])).rows[0].n).toBe(1);
    // Aynı villa yeniden bağlanabilir; aynı kaynak tekrar kullanılır.
    const pA = [...fake.props.keys()][0]!;
    fake.conns.get(cid)!.status = "disconnected";
    const r = await connectVilla(deps, { propertyId: pA, propertyName: "K Villa A", villaId: villaA });
    expect(r.ok).toBe(true);
    expect((await q(`select count(*)::int n from external_calendar_sources where villa_id = $1 and source_type = 'kiraligim'`, [villaA])).rows[0].n).toBe(1);
  });

  it("ev sahibi izni kaldırır (revoked): zamanlanmış senkron durumu işler, dolulukları kaldırır", async () => {
    const [cid, c] = [...fake.conns].find(([, x]) => x.external === villaB && x.status === "active")!;
    c.status = "revoked";
    expect(await refreshConnectionStatus(deps, cid)).toBe("revoked");
    expect(await busyOf(villaB)).toEqual([]);
    const s = await runScheduledSync(deps);
    expect(s.errorCode).toBeNull();
    expect((await listConnections(pool, { includeEnded: true })).find((x) => x.id === cid)!.status).toBe("revoked");
  });

  it("geçersiz villa ile bağlama yapılmaz; uzak bağlantı açılmaz", async () => {
    const before = fake.conns.size;
    const p = fake.addProperty("K Villa X");
    expect(await connectVilla(deps, { propertyId: p, propertyName: "x", villaId: randomUUID() })).toEqual({
      ok: false,
      code: "villa_not_found",
    });
    expect(fake.conns.size).toBe(before);
    void villaC;
  });

  it("webhook: kayıt secret'ı şifreli saklar; alıcı imza, zaman ve tekrar kontrolü yapar", async () => {
    const encKey = randomBytes(32).toString("base64");
    process.env.KIRALIGIM_ENCRYPTION_KEY = encKey;
    process.env.NEXT_PUBLIC_SITE_URL = "https://tatilinyeri.com";
    expect(await registerWebhook(deps)).toEqual({ ok: true });
    const st = await getSettings(pool);
    expect(st.webhook_url).toBe("https://tatilinyeri.com/api/integrations/kiraligim/webhook");
    expect(st.webhook_secret_enc).toMatch(/^v1:/);
    expect(st.webhook_secret_enc).not.toContain(fake.webhookSecret!.slice(6));

    const id = randomUUID();
    const body = JSON.stringify({ id, type: "calendar.changed" });
    const now = 1_800_000_000;
    const headers = (sig: string, ts = String(now), eid = id) =>
      new Headers({ "kiraligim-signature": sig, "kiraligim-timestamp": ts, "kiraligim-event-id": eid });
    const good = signKiraligimWebhook(fake.webhookSecret!, now, body);
    expect(await receiveWebhook(pool, { rawBody: body, headers: headers(good), nowSeconds: now })).toEqual({ status: 204, trigger: true });
    expect(await receiveWebhook(pool, { rawBody: body, headers: headers(good), nowSeconds: now })).toEqual({ status: 204, trigger: false });
    expect(await receiveWebhook(pool, { rawBody: body + " ", headers: headers(good), nowSeconds: now })).toMatchObject({ status: 401 });
    expect(await receiveWebhook(pool, { rawBody: body, headers: headers(good), nowSeconds: now + 400 })).toMatchObject({ status: 401 });
    const other = signKiraligimWebhook("whsec_other", now, body);
    expect(await receiveWebhook(pool, { rawBody: body, headers: headers(other), nowSeconds: now })).toMatchObject({ status: 401 });
    const id2 = randomUUID();
    const body2 = JSON.stringify({ id: id2, type: "calendar.changed" });
    const sig2 = signKiraligimWebhook(fake.webhookSecret!, now, body2);
    expect(await receiveWebhook(pool, { rawBody: body2, headers: headers(sig2, String(now), id), nowSeconds: now })).toMatchObject({ status: 400 });
    // Sır yenilenmeden adres güncellenirse mevcut sır korunur.
    const enc1 = st.webhook_secret_enc;
    await registerWebhook(deps);
    expect((await getSettings(pool)).webhook_secret_enc).toBe(enc1);
    // Şifreleme anahtarı yoksa alıcı çalışmaz (503), doğrulanmamış istek kabul edilmez.
    delete process.env.KIRALIGIM_ENCRYPTION_KEY;
    expect(await receiveWebhook(pool, { rawBody: body2, headers: headers(sig2, String(now), id2), nowSeconds: now })).toMatchObject({ status: 503 });
  });
});
