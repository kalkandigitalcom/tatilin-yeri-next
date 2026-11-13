import "server-only";

/* ===============================================================
   Kiraligim eklentisi — veritabanı katmanı (YALNIZ sunucu)
   ===============================================================
   Tablolar: kiraligim_settings, kiraligim_connections,
   kiraligim_webhook_events (migration 109) + mevcut
   external_calendar_sources / external_calendar_events.

   KURALLAR
     • Yalnız source_type = 'kiraligim' kaynaklarına ve onların
       etkinliklerine yazılır. iCal kaynaklarına, reservations ve
       manual_reservations tablolarına YAZILMAZ (yalnız çakışma raporu
       için okunur).
     • Bir villanın Kiraligim dolulukları her yazımda bütünüyle yeniden
       kurulur (birleştirilmiş, çakışmasız aralıklar) — aynı girdi her
       zaman aynı satırları üretir (idempotent).
     • Değişiklik + cursor aynı transaction'da yazılır.
=============================================================== */
import type { Pool, PoolClient } from "pg";

import { getPgPool } from "@/lib/db/pg.client";

import { externalUidFor, normalizeRanges } from "./core/ranges";
import type { BusyRange } from "./core/types";

export const KIRALIGIM_SOURCE_TYPE = "kiraligim";
export const KIRALIGIM_SOURCE_NAME = "Kiraligim API";
/** external_calendar_sources.ical_url NOT NULL olduğu için yer tutucu.
 *  iCal senkronu kiraligim kaynaklarını hiç çekmez. */
export const KIRALIGIM_SOURCE_URL = "https://app.kiraligim.com/#kiraligim-api";
const SYNC_LOCK_KEY = "tatilinyeri:kiraligim-sync";

export type Db = Pick<Pool, "query" | "connect">;
export const defaultDb = (): Db => getPgPool();

export type KiraligimSettingsRow = {
  account_id: string | null;
  account_name: string | null;
  webhook_url: string | null;
  webhook_secret_enc: string | null;
  webhook_registered_at: string | null;
  account_cursor: string | null;
  cursor_updated_at: string | null;
  last_sync_at: string | null;
  last_sync_ok: boolean | null;
  last_error_code: string | null;
};

export type LocalConnectionStatus = "active" | "paused" | "disconnected" | "revoked";

export type KiraligimConnectionRow = {
  id: string;
  property_id: string;
  property_name: string | null;
  villa_id: string;
  villa_title: string | null;
  source_id: string;
  status: LocalConnectionStatus;
  window_from: string | null;
  window_to: string | null;
  snapshot_at: string | null;
  last_change_id: string | null;
  last_error_code: string | null;
  busy_count: number;
};

export async function withTx<T>(db: Db, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const out = await fn(c);
    await c.query("COMMIT");
    return out;
  } catch (err) {
    await c.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    c.release();
  }
}

/* ---------------------------------------------------------------
   Ayarlar
--------------------------------------------------------------- */
export async function getSettings(db: Pick<Db, "query"> = defaultDb()): Promise<KiraligimSettingsRow> {
  const r = await db.query(
    `select account_id, account_name, webhook_url, webhook_secret_enc,
            webhook_registered_at, account_cursor, cursor_updated_at,
            last_sync_at, last_sync_ok, last_error_code
       from public.kiraligim_settings where id = 1`,
  );
  return (
    (r.rows[0] as KiraligimSettingsRow | undefined) ?? {
      account_id: null,
      account_name: null,
      webhook_url: null,
      webhook_secret_enc: null,
      webhook_registered_at: null,
      account_cursor: null,
      cursor_updated_at: null,
      last_sync_at: null,
      last_sync_ok: null,
      last_error_code: null,
    }
  );
}

const SETTINGS_COLUMNS = new Set([
  "account_id",
  "account_name",
  "webhook_url",
  "webhook_secret_enc",
  "webhook_registered_at",
  "account_cursor",
  "cursor_updated_at",
  "last_sync_at",
  "last_sync_ok",
  "last_error_code",
]);

export async function updateSettings(
  db: Pick<Db, "query">,
  patch: Partial<Record<keyof KiraligimSettingsRow, unknown>>,
): Promise<void> {
  const keys = Object.keys(patch).filter((k) => SETTINGS_COLUMNS.has(k));
  if (keys.length === 0) return;
  const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
  await db.query(
    `insert into public.kiraligim_settings (id) values (1) on conflict (id) do nothing`,
  );
  await db.query(`update public.kiraligim_settings set ${sets}, updated_at = now() where id = 1`, [
    ...keys.map((k) => (patch as Record<string, unknown>)[k]),
  ]);
}

/* ---------------------------------------------------------------
   Bağlantılar
--------------------------------------------------------------- */
const CONNECTION_SELECT = `
  select c.id, c.property_id, c.property_name, c.villa_id, v.title as villa_title,
         c.source_id, c.status, c.window_from::text as window_from,
         c.window_to::text as window_to, c.snapshot_at, c.last_change_id::text as last_change_id,
         c.last_error_code,
         (select count(*)::int from public.external_calendar_events e
           where e.source_id = c.source_id and e.is_active) as busy_count
    from public.kiraligim_connections c
    left join public.villa v on v.id = c.villa_id`;

export async function listConnections(
  db: Pick<Db, "query"> = defaultDb(),
  opts: { includeEnded?: boolean } = {},
): Promise<KiraligimConnectionRow[]> {
  const r = await db.query(
    `${CONNECTION_SELECT}
      ${opts.includeEnded ? "" : "where c.status in ('active','paused')"}
      order by c.created_at, c.id`,
  );
  return r.rows as KiraligimConnectionRow[];
}

export async function getConnection(db: Pick<Db, "query">, id: string): Promise<KiraligimConnectionRow | null> {
  const r = await db.query(`${CONNECTION_SELECT} where c.id = $1`, [id]);
  return (r.rows[0] as KiraligimConnectionRow | undefined) ?? null;
}

/** Villa için kiraligim kaynağını bulur ya da oluşturur (aktif). */
export async function ensureKiraligimSource(c: PoolClient, villaId: string): Promise<string> {
  const found = await c.query(
    `select id from public.external_calendar_sources
      where villa_id = $1 and source_type = $2
      order by created_at limit 1`,
    [villaId, KIRALIGIM_SOURCE_TYPE],
  );
  if (found.rows[0]) {
    await c.query(
      `update public.external_calendar_sources
          set is_active = true, last_error = null, updated_at = now()
        where id = $1`,
      [found.rows[0].id],
    );
    return found.rows[0].id as string;
  }
  const ins = await c.query(
    `insert into public.external_calendar_sources
       (villa_id, source_name, source_type, ical_url, is_active)
     values ($1, $2, $3, $4, true)
     returning id`,
    [villaId, KIRALIGIM_SOURCE_NAME, KIRALIGIM_SOURCE_TYPE, KIRALIGIM_SOURCE_URL],
  );
  return ins.rows[0].id as string;
}

export async function insertConnection(
  c: PoolClient,
  row: { id: string; propertyId: string; propertyName: string | null; villaId: string; sourceId: string },
): Promise<void> {
  await c.query(
    `insert into public.kiraligim_connections
       (id, property_id, property_name, villa_id, source_id, status)
     values ($1, $2, $3, $4, $5, 'active')
     on conflict (id) do update
       set property_id = excluded.property_id,
           property_name = excluded.property_name,
           villa_id = excluded.villa_id,
           source_id = excluded.source_id,
           status = 'active',
           last_error_code = null,
           updated_at = now()`,
    [row.id, row.propertyId, row.propertyName, row.villaId, row.sourceId],
  );
}

/** Bağlantı satırını kilitler (aynı bağlantıya eşzamanlı yazım yok). */
export async function lockConnection(c: PoolClient, id: string): Promise<KiraligimConnectionRow | null> {
  const r = await c.query(
    `select id, property_id, property_name, villa_id, null::text as villa_title, source_id, status,
            window_from::text as window_from, window_to::text as window_to, snapshot_at,
            last_change_id::text as last_change_id, last_error_code, 0 as busy_count
       from public.kiraligim_connections where id = $1 for update`,
    [id],
  );
  return (r.rows[0] as KiraligimConnectionRow | undefined) ?? null;
}

export async function setConnectionState(
  db: Pick<Db, "query">,
  id: string,
  patch: {
    status?: LocalConnectionStatus;
    last_error_code?: string | null;
    snapshot_at?: string | null;
    window_from?: string | null;
    window_to?: string | null;
    last_change_id?: string | null;
  },
): Promise<void> {
  const keys = Object.keys(patch) as (keyof typeof patch)[];
  if (keys.length === 0) return;
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
  await db.query(`update public.kiraligim_connections set ${sets}, updated_at = now() where id = $1`, [
    id,
    ...keys.map((k) => patch[k] ?? null),
  ]);
}

/* ---------------------------------------------------------------
   Dolu aralıklar (external_calendar_events, yalnız kiraligim kaynağı)
--------------------------------------------------------------- */
export async function readBusy(c: Pick<Db, "query">, sourceId: string): Promise<BusyRange[]> {
  const r = await c.query(
    `select start_date::text as start_date, end_date::text as end_date
       from public.external_calendar_events
      where source_id = $1 and is_active
      order by start_date`,
    [sourceId],
  );
  return r.rows as BusyRange[];
}

/** Kaynağın bütün etkinliklerini verilen aralık kümesiyle değiştirir. */
export async function replaceBusy(
  c: PoolClient,
  sourceId: string,
  villaId: string,
  ranges: readonly BusyRange[],
): Promise<number> {
  const src = await c.query(`select source_type from public.external_calendar_sources where id = $1 for update`, [
    sourceId,
  ]);
  if (src.rows[0]?.source_type !== KIRALIGIM_SOURCE_TYPE) {
    // Savunma: yanlış kaynak kimliğiyle iCal etkinliklerine asla yazılmaz.
    throw new Error("kiraligim_source_mismatch");
  }
  const norm = normalizeRanges(ranges);
  await c.query(`delete from public.external_calendar_events where source_id = $1`, [sourceId]);
  if (norm.length > 0) {
    const values: unknown[] = [];
    const tuples = norm.map((r, i) => {
      const b = i * 5;
      values.push(sourceId, villaId, externalUidFor(r), r.start_date, r.end_date);
      return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}::date, $${b + 5}::date, 'Kiraligim', 'CONFIRMED', true, now())`;
    });
    await c.query(
      `insert into public.external_calendar_events
         (source_id, villa_id, external_uid, start_date, end_date, summary, status, is_active, last_seen_at)
       values ${tuples.join(", ")}`,
      values,
    );
  }
  await c.query(
    `update public.external_calendar_sources
        set last_synced_at = now(), last_success_at = now(), last_error = null,
            last_event_count = $2, updated_at = now()
      where id = $1`,
    [sourceId, norm.length],
  );
  return norm.length;
}

/** Bağlantı bittiğinde: Kiraligim dolulukları takvimden kalkar, kaynak pasif olur. */
export async function clearSource(c: PoolClient, sourceId: string): Promise<void> {
  const src = await c.query(`select source_type from public.external_calendar_sources where id = $1 for update`, [
    sourceId,
  ]);
  if (src.rows[0]?.source_type !== KIRALIGIM_SOURCE_TYPE) throw new Error("kiraligim_source_mismatch");
  await c.query(`delete from public.external_calendar_events where source_id = $1`, [sourceId]);
  await c.query(
    `update public.external_calendar_sources
        set is_active = false, last_event_count = 0, updated_at = now()
      where id = $1`,
    [sourceId],
  );
}

/* ---------------------------------------------------------------
   Webhook olayları ve kilit
--------------------------------------------------------------- */
/** true: ilk kez görülen olay; false: daha önce işlenmiş. */
export async function rememberWebhookEvent(db: Pick<Db, "query">, eventId: string): Promise<boolean> {
  const r = await db.query(
    `insert into public.kiraligim_webhook_events (event_id) values ($1)
     on conflict (event_id) do nothing returning event_id`,
    [eventId],
  );
  return (r.rowCount ?? 0) > 0;
}

export async function pruneWebhookEvents(db: Pick<Db, "query">): Promise<number> {
  const r = await db.query(
    `delete from public.kiraligim_webhook_events where received_at < now() - interval '7 days'`,
  );
  return r.rowCount ?? 0;
}

/** Oturum düzeyi advisory lock: aynı anda tek senkron. */
export async function withSyncLock<T>(db: Db, fn: () => Promise<T>): Promise<{ locked: false } | { locked: true; value: T }> {
  const c = await db.connect();
  try {
    const got = await c.query(`select pg_try_advisory_lock(hashtextextended($1, 0)) as ok`, [SYNC_LOCK_KEY]);
    if (!got.rows[0]?.ok) return { locked: false };
    try {
      return { locked: true, value: await fn() };
    } finally {
      await c.query(`select pg_advisory_unlock(hashtextextended($1, 0))`, [SYNC_LOCK_KEY]).catch(() => undefined);
    }
  } finally {
    c.release();
  }
}

/* ---------------------------------------------------------------
   Yönetim ekranı raporları (salt okuma)
--------------------------------------------------------------- */
export type KiraligimConflict = {
  villa_id: string;
  villa_title: string | null;
  kind: "reservation" | "manual";
  status: string | null;
  start_date: string;
  end_date: string;
  busy_start: string;
  busy_end: string;
};

/** Kiraligim doluluğu ile çakışan yerel rezervasyon (pending/confirmed) ve
 *  manuel bloklar — bugünden itibaren. Hiçbir şey otomatik değiştirilmez. */
export async function findConflicts(db: Pick<Db, "query"> = defaultDb()): Promise<KiraligimConflict[]> {
  const r = await db.query(
    `with k as (
       select e.villa_id, e.start_date, e.end_date
         from public.external_calendar_events e
         join public.kiraligim_connections c on c.source_id = e.source_id
        where c.status in ('active','paused') and e.is_active and e.end_date > current_date
     )
     select x.villa_id, v.title as villa_title, x.kind, x.status,
            x.start_date::text as start_date, x.end_date::text as end_date,
            k.start_date::text as busy_start, k.end_date::text as busy_end
       from (
         select villa_id, 'reservation'::text as kind, status, start_date, end_date
           from public.reservations where status in ('pending','confirmed')
         union all
         select villa_id, 'manual'::text, null, start_date, end_date
           from public.manual_reservations
       ) x
       join k on k.villa_id = x.villa_id and x.start_date < k.end_date and x.end_date > k.start_date
       left join public.villa v on v.id = x.villa_id
      order by x.start_date, x.villa_id
      limit 200`,
  );
  return r.rows as KiraligimConflict[];
}

export type KiraligimDuplicateFeed = {
  villa_id: string;
  villa_title: string | null;
  source_id: string;
  source_name: string;
};

/** Aynı villa hem Kiraligim API hem Kiraligim iCal adresiyle besleniyorsa.
 *  Yalnız uyarı içindir; iCal kaynağı otomatik kapatılmaz. */
export async function findDuplicateFeeds(db: Pick<Db, "query"> = defaultDb()): Promise<KiraligimDuplicateFeed[]> {
  const r = await db.query(
    `select s.villa_id, v.title as villa_title, s.id as source_id, s.source_name
       from public.external_calendar_sources s
       join public.kiraligim_connections c
         on c.villa_id = s.villa_id and c.status in ('active','paused')
       left join public.villa v on v.id = s.villa_id
      where s.source_type <> $1 and s.is_active
        and s.ical_url ~* '^https?://([a-z0-9-]+\\.)*kiraligim\\.com(/|:|$)'
      order by v.title, s.source_name`,
    [KIRALIGIM_SOURCE_TYPE],
  );
  return r.rows as KiraligimDuplicateFeed[];
}

export type LocalVilla = { id: string; title: string | null; is_active: boolean | null };

export async function listLocalVillas(db: Pick<Db, "query"> = defaultDb()): Promise<LocalVilla[]> {
  const r = await db.query(
    `select id, title, is_active from public.villa where deleted_at is null order by title nulls last, id`,
  );
  return r.rows as LocalVilla[];
}

export async function villaExists(db: Pick<Db, "query">, villaId: string): Promise<boolean> {
  const r = await db.query(`select 1 from public.villa where id = $1 and deleted_at is null`, [villaId]);
  return (r.rowCount ?? 0) > 0;
}
