import "server-only";

/* ===============================================================
   Kiraligim eklentisi — senkron mantığı (YALNIZ sunucu)
   ===============================================================
   AKIŞ
     1) Bağlama: POST /calendar-connections {property_id, external_property_id
        = yerel villa id} → kiraligim kaynağı + bağlantı satırı.
     2) Hesap cursor'ı yoksa ÖNCE alınır (GET /calendar-changes, cursorsuz)
        → sonra snapshot; böylece arada değişiklik kaçmaz.
     3) Snapshot: villanın Kiraligim dolulukları bütünüyle yeniden kurulur.
     4) pull(): hesap akışı sayfa sayfa; her sayfanın değişiklikleri ve
        yeni cursor TEK transaction'da yazılır. Kesinti → aynı sayfa
        yeniden uygulanır, sonuç değişmez.
     5) 410 cursor_expired → yeni cursor + bütün güncel bağlantılar için
        yeniden snapshot. Snapshot 404 → bağlantı durumu sorulur:
        paused → doluluklar KORUNUR (bekler); disconnected/revoked →
        doluluklar takvimden kalkar.
     Aynı anda tek senkron: advisory lock.
=============================================================== */
import { KiraligimApiError, createKiraligimClient, type KiraligimClient } from "./core/client.server";
import { applyChange } from "./core/ranges";
import type { KiraligimAccountChange } from "./core/types";
import { kiraligimApiBase, kiraligimApiKey } from "./config.server";
import {
  clearSource,
  defaultDb,
  ensureKiraligimSource,
  getConnection,
  getSettings,
  insertConnection,
  listConnections,
  lockConnection,
  readBusy,
  replaceBusy,
  setConnectionState,
  updateSettings,
  villaExists,
  withSyncLock,
  withTx,
  type Db,
} from "./store.server";

export type KiraligimDeps = { db: Db; client: KiraligimClient };

export class KiraligimNotConfigured extends Error {
  constructor() {
    super("kiraligim_not_configured");
  }
}

export function defaultDeps(): KiraligimDeps {
  const base = kiraligimApiBase();
  const key = kiraligimApiKey();
  if (!base || !key) throw new KiraligimNotConfigured();
  return { db: defaultDb(), client: createKiraligimClient({ base, apiKey: key }) };
}

/** Hata → kısa, gizli bilgi içermeyen kod (loga ve DB'ye yalnız bu yazılır). */
export function errorCode(err: unknown): string {
  if (err instanceof KiraligimApiError) return err.code.slice(0, 64);
  if (err instanceof KiraligimNotConfigured) return "not_configured";
  if (err && typeof err === "object" && "code" in err && typeof err.code === "string") {
    return `db_${err.code}`.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 64);
  }
  if (err instanceof Error && /^[a-z_]{1,64}$/.test(err.message)) return err.message;
  return "error";
}

/* ---------------------------------------------------------------
   Bağlama ve snapshot
--------------------------------------------------------------- */
export type ConnectResult =
  | { ok: true; connectionId: string; busy: number }
  | { ok: false; code: string };

export async function connectVilla(
  deps: KiraligimDeps,
  input: { propertyId: string; propertyName: string | null; villaId: string },
): Promise<ConnectResult> {
  if (!(await villaExists(deps.db, input.villaId))) return { ok: false, code: "villa_not_found" };
  let remote;
  try {
    remote = await deps.client.connect(input.propertyId, input.villaId);
  } catch (err) {
    return { ok: false, code: errorCode(err) };
  }
  const conn = remote.data;
  if (conn.external_property_id !== input.villaId) return { ok: false, code: "external_id_mismatch" };
  try {
    await withTx(deps.db, async (c) => {
      const sourceId = await ensureKiraligimSource(c, input.villaId);
      await insertConnection(c, {
        id: conn.id,
        propertyId: conn.property_id,
        propertyName: input.propertyName,
        villaId: input.villaId,
        sourceId,
      });
    });
  } catch (err) {
    // Yerel kayıt başarısızsa uzak bağlantıyı da kapat (yarım eşleşme kalmasın).
    await deps.client.disconnect(conn.id).catch(() => undefined);
    return { ok: false, code: errorCode(err) };
  }
  await ensureAccountCursor(deps);
  const snap = await snapshotConnection(deps, conn.id);
  return snap.ok ? { ok: true, connectionId: conn.id, busy: snap.busy } : { ok: false, code: snap.code };
}

/** Hesap cursor'ı yoksa şimdiki konumdan alır (snapshot'lardan ÖNCE). */
export async function ensureAccountCursor(deps: KiraligimDeps): Promise<void> {
  const s = await getSettings(deps.db);
  if (s.account_cursor) return;
  const page = await deps.client.accountChanges(null, 1);
  await updateSettings(deps.db, { account_cursor: page.next_cursor, cursor_updated_at: new Date().toISOString() });
}

export type SnapshotResult = { ok: true; busy: number } | { ok: false; code: string };

export async function snapshotConnection(deps: KiraligimDeps, connectionId: string): Promise<SnapshotResult> {
  let snap;
  try {
    snap = await deps.client.snapshot(connectionId);
  } catch (err) {
    if (err instanceof KiraligimApiError && err.status === 404) {
      const st = await refreshConnectionStatus(deps, connectionId);
      return { ok: false, code: st === "active" ? "not_found" : `connection_${st}` };
    }
    const code = errorCode(err);
    await setConnectionState(deps.db, connectionId, { last_error_code: code });
    return { ok: false, code };
  }
  const busy = await withTx(deps.db, async (c) => {
    const row = await lockConnection(c, connectionId);
    if (!row || (row.status !== "active" && row.status !== "paused")) throw new Error("connection_not_current");
    const n = await replaceBusy(c, row.source_id, row.villa_id, snap.busy_dates);
    await c.query(
      `update public.kiraligim_connections
          set status = 'active', snapshot_at = now(), window_from = $2::date, window_to = $3::date,
              last_error_code = null, updated_at = now()
        where id = $1`,
      [connectionId, snap.from, snap.to],
    );
    return n;
  });
  return { ok: true, busy };
}

/** Uzak durumu yerel kayda işler. Biten bağlantının dolulukları kalkar. */
export async function refreshConnectionStatus(
  deps: KiraligimDeps,
  connectionId: string,
): Promise<"active" | "paused" | "disconnected" | "revoked" | "not_found"> {
  let status: "active" | "paused" | "disconnected" | "revoked" | "not_found";
  try {
    status = (await deps.client.connection(connectionId)).status;
  } catch (err) {
    if (err instanceof KiraligimApiError && err.status === 404) status = "not_found";
    else throw err;
  }
  if (status === "active" || status === "paused") {
    await setConnectionState(deps.db, connectionId, { status, last_error_code: null });
    return status;
  }
  const ended = status === "not_found" ? "revoked" : status;
  await withTx(deps.db, async (c) => {
    const row = await lockConnection(c, connectionId);
    if (!row) return;
    await clearSource(c, row.source_id);
    await c.query(
      `update public.kiraligim_connections set status = $2, updated_at = now() where id = $1`,
      [connectionId, ended],
    );
  });
  return status;
}

/** Acente tarafından bağlantıyı keser (Kiraligim'deki kayıtlar değişmez). */
export async function disconnectVilla(deps: KiraligimDeps, connectionId: string): Promise<{ ok: boolean; code?: string }> {
  try {
    await deps.client.disconnect(connectionId);
  } catch (err) {
    if (!(err instanceof KiraligimApiError && err.status === 404)) return { ok: false, code: errorCode(err) };
  }
  await withTx(deps.db, async (c) => {
    const row = await lockConnection(c, connectionId);
    if (!row) return;
    await clearSource(c, row.source_id);
    await c.query(
      `update public.kiraligim_connections set status = 'disconnected', updated_at = now() where id = $1`,
      [connectionId],
    );
  });
  return { ok: true };
}

/* ---------------------------------------------------------------
   Hesap geneli değişiklik akışı
--------------------------------------------------------------- */
export type PullSummary = {
  locked: boolean;
  pages: number;
  applied: number;
  skipped: number;
  resnapshotted: number;
  errorCode: string | null;
};

const MAX_PAGES = 50;

export async function pull(deps: KiraligimDeps): Promise<PullSummary> {
  const res = await withSyncLock(deps.db, () => pullLocked(deps));
  if (!res.locked) {
    return { locked: false, pages: 0, applied: 0, skipped: 0, resnapshotted: 0, errorCode: null };
  }
  return res.value;
}

async function pullLocked(deps: KiraligimDeps): Promise<PullSummary> {
  const sum: PullSummary = { locked: true, pages: 0, applied: 0, skipped: 0, resnapshotted: 0, errorCode: null };
  try {
    await ensureAccountCursor(deps);
    for (let i = 0; i < MAX_PAGES; i++) {
      const settings = await getSettings(deps.db);
      let page;
      try {
        page = await deps.client.accountChanges(settings.account_cursor, 200);
      } catch (err) {
        if (err instanceof KiraligimApiError && (err.code === "cursor_expired" || err.code === "invalid_cursor")) {
          sum.resnapshotted += await resyncAll(deps);
          break;
        }
        throw err;
      }
      sum.pages += 1;
      const r = await applyPage(deps, settings.account_cursor, page.changes, page.next_cursor);
      sum.applied += r.applied;
      sum.skipped += r.skipped;
      if (r.cursorMoved === false) break; // başka bir süreç cursor'ı ilerletti
      if (!page.has_more) break;
    }
    await updateSettings(deps.db, { last_sync_at: new Date().toISOString(), last_sync_ok: true, last_error_code: null });
  } catch (err) {
    sum.errorCode = errorCode(err);
    await updateSettings(deps.db, {
      last_sync_at: new Date().toISOString(),
      last_sync_ok: false,
      last_error_code: sum.errorCode,
    }).catch(() => undefined);
  }
  return sum;
}

/** Bir sayfayı ve yeni cursor'ı tek transaction'da yazar. */
async function applyPage(
  deps: KiraligimDeps,
  expectedCursor: string | null,
  changes: readonly KiraligimAccountChange[],
  nextCursor: string,
): Promise<{ applied: number; skipped: number; cursorMoved: boolean }> {
  return withTx(deps.db, async (c) => {
    const cur = await c.query(`select account_cursor from public.kiraligim_settings where id = 1 for update`);
    if ((cur.rows[0]?.account_cursor ?? null) !== expectedCursor) {
      return { applied: 0, skipped: 0, cursorMoved: false };
    }
    let applied = 0;
    let skipped = 0;
    const byConnection = new Map<string, KiraligimAccountChange[]>();
    for (const ch of changes) {
      const list = byConnection.get(ch.connection_id) ?? [];
      list.push(ch);
      byConnection.set(ch.connection_id, list);
    }
    for (const [connectionId, list] of byConnection) {
      const row = await lockConnection(c, connectionId);
      // Duraklatılmış bağlantı yeniden etkinleşince Kiraligim tam pencere
      // değişikliği gönderir → paused satır da uygulanır ve active olur.
      if (
        !row ||
        (row.status !== "active" && row.status !== "paused") ||
        row.villa_id !== list[0]!.external_property_id
      ) {
        skipped += list.length;
        continue;
      }
      let busy = await readBusy(c, row.source_id);
      const ordered = [...list].sort((a, b) => Number(a.change_id) - Number(b.change_id));
      for (const ch of ordered) busy = applyChange(busy, ch);
      await replaceBusy(c, row.source_id, row.villa_id, busy);
      await c.query(
        `update public.kiraligim_connections
            set status = 'active', last_change_id = $2, last_error_code = null, updated_at = now()
          where id = $1`,
        [connectionId, ordered[ordered.length - 1]!.change_id],
      );
      applied += list.length;
    }
    await c.query(
      `update public.kiraligim_settings set account_cursor = $1, cursor_updated_at = now(), updated_at = now() where id = 1`,
      [nextCursor],
    );
    return { applied, skipped, cursorMoved: true };
  });
}

/** Cursor süresi dolduğunda: yeni cursor, sonra bütün güncel bağlantılar için snapshot. */
export async function resyncAll(deps: KiraligimDeps): Promise<number> {
  const page = await deps.client.accountChanges(null, 1);
  await updateSettings(deps.db, { account_cursor: page.next_cursor, cursor_updated_at: new Date().toISOString() });
  let n = 0;
  for (const conn of await listConnections(deps.db)) {
    const r = await snapshotConnection(deps, conn.id);
    if (r.ok) n += 1;
  }
  return n;
}

/** Zamanlanmış görev: değişiklik akışı + duraklatılmış bağlantıların durumu. */
export async function runScheduledSync(deps: KiraligimDeps): Promise<PullSummary & { statusChecked: number }> {
  const sum = await pull(deps);
  let statusChecked = 0;
  if (sum.locked) {
    for (const conn of await listConnections(deps.db)) {
      if (conn.status !== "paused" && !conn.last_error_code) continue;
      try {
        const st = await refreshConnectionStatus(deps, conn.id);
        statusChecked += 1;
        // Hata almış (snapshot alınamamış) etkin bağlantıyı yeniden dene.
        if (st === "active" && conn.last_error_code) await snapshotConnection(deps, conn.id);
      } catch {
        // tek bağlantının hatası diğerlerini durdurmaz
      }
    }
  }
  return { ...sum, statusChecked };
}

export { getConnection };
