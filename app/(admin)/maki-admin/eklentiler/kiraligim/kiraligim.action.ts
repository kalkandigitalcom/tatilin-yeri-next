"use server";

/* ===============================================================
   Kiraligim eklentisi — admin server action'ları
   ===============================================================
   Her action requirePermission("plugins") ile korunur. Dönen veriler
   yalnız gösterim alanlarıdır: API anahtarı, şifreleme anahtarı ve
   webhook secret'ı (şifreli ya da açık) istemciye HİÇ dönmez — yalnız
   "tanımlı / tanımsız" bilgisi döner. Hatalar kısa kodlarla döner.
=============================================================== */
import { requirePermission } from "@/lib/auth/action-authz";
import { kiraligimConfigStatus, kiraligimWebhookUrl } from "@/lib/plugins/kiraligim/config.server";
import {
  defaultDb,
  findConflicts,
  findDuplicateFeeds,
  getSettings,
  listConnections,
  listLocalVillas,
  updateSettings,
  type KiraligimConflict,
  type KiraligimConnectionRow,
  type KiraligimDuplicateFeed,
  type LocalVilla,
} from "@/lib/plugins/kiraligim/store.server";
import {
  connectVilla,
  defaultDeps,
  disconnectVilla,
  errorCode,
  pull,
  snapshotConnection,
} from "@/lib/plugins/kiraligim/sync.server";
import { deleteWebhook, registerWebhook, rotateWebhookSecret } from "@/lib/plugins/kiraligim/webhook.server";
import type { KiraligimProperty } from "@/lib/plugins/kiraligim/core/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type KiraligimOverview = {
  config: ReturnType<typeof kiraligimConfigStatus>;
  webhookTargetUrl: string | null;
  account: { id: string | null; name: string | null };
  webhook: { url: string | null; registeredAt: string | null; secretStored: boolean };
  sync: { lastAt: string | null; ok: boolean | null; errorCode: string | null; hasCursor: boolean };
  connections: KiraligimConnectionRow[];
  duplicates: KiraligimDuplicateFeed[];
  conflicts: KiraligimConflict[];
};

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; code: string };

export async function getKiraligimOverviewAction(): Promise<KiraligimOverview> {
  await requirePermission("plugins");
  const db = defaultDb();
  const [s, connections, duplicates, conflicts] = await Promise.all([
    getSettings(db),
    listConnections(db, { includeEnded: true }),
    findDuplicateFeeds(db),
    findConflicts(db),
  ]);
  return {
    config: kiraligimConfigStatus(),
    webhookTargetUrl: kiraligimWebhookUrl(),
    account: { id: s.account_id, name: s.account_name },
    webhook: { url: s.webhook_url, registeredAt: s.webhook_registered_at, secretStored: !!s.webhook_secret_enc },
    sync: { lastAt: s.last_sync_at, ok: s.last_sync_ok, errorCode: s.last_error_code, hasCursor: !!s.account_cursor },
    connections,
    duplicates,
    conflicts,
  };
}

export async function testKiraligimConnectionAction(): Promise<ActionResult<{ name: string }>> {
  await requirePermission("plugins");
  try {
    const deps = defaultDeps();
    const me = await deps.client.me();
    await updateSettings(deps.db, { account_id: me.id, account_name: me.name });
    return { ok: true, data: { name: me.name } };
  } catch (err) {
    return { ok: false, code: errorCode(err) };
  }
}

export async function listKiraligimMappingDataAction(): Promise<
  ActionResult<{ properties: KiraligimProperty[]; villas: LocalVilla[] }>
> {
  await requirePermission("plugins");
  try {
    const deps = defaultDeps();
    const [properties, villas] = await Promise.all([deps.client.properties(), listLocalVillas(deps.db)]);
    return { ok: true, data: { properties, villas } };
  } catch (err) {
    return { ok: false, code: errorCode(err) };
  }
}

export async function connectKiraligimVillaAction(input: {
  propertyId: string;
  propertyName: string | null;
  villaId: string;
}): Promise<ActionResult<{ busy: number }>> {
  await requirePermission("plugins");
  if (!UUID.test(input.propertyId) || !UUID.test(input.villaId)) return { ok: false, code: "invalid_request" };
  try {
    const r = await connectVilla(defaultDeps(), {
      propertyId: input.propertyId.toLowerCase(),
      propertyName: typeof input.propertyName === "string" ? input.propertyName.slice(0, 200) : null,
      villaId: input.villaId.toLowerCase(),
    });
    return r.ok ? { ok: true, data: { busy: r.busy } } : { ok: false, code: r.code };
  } catch (err) {
    return { ok: false, code: errorCode(err) };
  }
}

export async function disconnectKiraligimVillaAction(connectionId: string): Promise<ActionResult> {
  await requirePermission("plugins");
  if (!UUID.test(connectionId)) return { ok: false, code: "invalid_request" };
  try {
    const r = await disconnectVilla(defaultDeps(), connectionId.toLowerCase());
    return r.ok ? { ok: true } : { ok: false, code: r.code ?? "error" };
  } catch (err) {
    return { ok: false, code: errorCode(err) };
  }
}

export async function resnapshotKiraligimAction(connectionId: string): Promise<ActionResult<{ busy: number }>> {
  await requirePermission("plugins");
  if (!UUID.test(connectionId)) return { ok: false, code: "invalid_request" };
  try {
    const r = await snapshotConnection(defaultDeps(), connectionId.toLowerCase());
    return r.ok ? { ok: true, data: { busy: r.busy } } : { ok: false, code: r.code };
  } catch (err) {
    return { ok: false, code: errorCode(err) };
  }
}

export async function syncKiraligimNowAction(): Promise<ActionResult<{ applied: number; locked: boolean }>> {
  await requirePermission("plugins");
  try {
    const s = await pull(defaultDeps());
    if (s.errorCode) return { ok: false, code: s.errorCode };
    return { ok: true, data: { applied: s.applied, locked: s.locked } };
  } catch (err) {
    return { ok: false, code: errorCode(err) };
  }
}

export async function registerKiraligimWebhookAction(): Promise<ActionResult> {
  await requirePermission("plugins");
  try {
    return await registerWebhook(defaultDeps());
  } catch (err) {
    return { ok: false, code: errorCode(err) };
  }
}

export async function rotateKiraligimWebhookAction(): Promise<ActionResult> {
  await requirePermission("plugins");
  try {
    return await rotateWebhookSecret(defaultDeps());
  } catch (err) {
    return { ok: false, code: errorCode(err) };
  }
}

export async function deleteKiraligimWebhookAction(): Promise<ActionResult> {
  await requirePermission("plugins");
  try {
    return await deleteWebhook(defaultDeps());
  } catch (err) {
    return { ok: false, code: errorCode(err) };
  }
}
