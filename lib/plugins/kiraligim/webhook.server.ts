import "server-only";

/* ===============================================================
   Kiraligim eklentisi — webhook kaydı ve alıcı (YALNIZ sunucu)
   ===============================================================
   • Kayıt: PUT /webhook → yanıttaki secret (yalnız oluşturmada döner)
     KIRALIGIM_ENCRYPTION_KEY ile AES-256-GCM şifrelenip veritabanına
     yazılır. Secret tarayıcıya, loga veya hata mesajına HİÇ gitmez.
     Adres zaten kayıtlıysa (200, secret dönmez) ve yerel secret yoksa
     sır yenilenir (rotate-secret) — doğrulanamayan webhook kalmaz.
   • Alıcı: imza + zaman damgası sunucuda doğrulanır; olay kimliği
     tekrarsa yok sayılır. Gövde YALNIZ tetikleyicidir: veri her zaman
     imzalı API'den, aynı cursor yolu (pull) ile alınır.
=============================================================== */
import { verifyKiraligimWebhook } from "./core/webhook-verify";
import { kiraligimEncryptionKey, kiraligimWebhookUrl } from "./config.server";
import { decryptKiraligimSecret, encryptKiraligimSecret } from "./crypto.server";
import { errorCode, type KiraligimDeps } from "./sync.server";
import { getSettings, rememberWebhookEvent, updateSettings, type Db } from "./store.server";

export type WebhookOpResult = { ok: true } | { ok: false; code: string };

export async function registerWebhook(deps: KiraligimDeps): Promise<WebhookOpResult> {
  const key = kiraligimEncryptionKey();
  if (!key) return { ok: false, code: "encryption_key_missing" };
  const url = kiraligimWebhookUrl();
  if (!url) return { ok: false, code: "site_url_invalid" };
  try {
    const r = await deps.client.putWebhook(url);
    let secret = r.data.secret ?? null;
    if (!secret) {
      const local = await getSettings(deps.db);
      const usable = local.webhook_secret_enc ? decryptKiraligimSecret(local.webhook_secret_enc, key) : null;
      if (!usable) secret = (await deps.client.rotateWebhookSecret()).secret;
    }
    await updateSettings(deps.db, {
      webhook_url: r.data.url,
      webhook_registered_at: new Date().toISOString(),
      ...(secret ? { webhook_secret_enc: encryptKiraligimSecret(secret, key) } : {}),
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, code: errorCode(err) };
  }
}

export async function rotateWebhookSecret(deps: KiraligimDeps): Promise<WebhookOpResult> {
  const key = kiraligimEncryptionKey();
  if (!key) return { ok: false, code: "encryption_key_missing" };
  try {
    const r = await deps.client.rotateWebhookSecret();
    await updateSettings(deps.db, { webhook_secret_enc: encryptKiraligimSecret(r.secret, key) });
    return { ok: true };
  } catch (err) {
    return { ok: false, code: errorCode(err) };
  }
}

export async function deleteWebhook(deps: KiraligimDeps): Promise<WebhookOpResult> {
  try {
    await deps.client.deleteWebhook();
  } catch (err) {
    const code = errorCode(err);
    if (code !== "not_found") return { ok: false, code };
  }
  await updateSettings(deps.db, { webhook_url: null, webhook_secret_enc: null, webhook_registered_at: null });
  return { ok: true };
}

export type WebhookReceipt =
  | { status: 204; trigger: boolean }
  | { status: 400 | 401 | 413 | 503; error: string };

const MAX_BODY = 64 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Alıcı: doğrular, tekrarı ayıklar; trigger=true ise çağıran pull() başlatır. */
export async function receiveWebhook(
  db: Pick<Db, "query">,
  input: { rawBody: string; headers: Headers; nowSeconds?: number },
): Promise<WebhookReceipt> {
  if (Buffer.byteLength(input.rawBody, "utf8") > MAX_BODY) return { status: 413, error: "payload_too_large" };
  const key = kiraligimEncryptionKey();
  if (!key) return { status: 503, error: "not_configured" };
  const settings = await getSettings(db);
  const secret = settings.webhook_secret_enc ? decryptKiraligimSecret(settings.webhook_secret_enc, key) : null;
  if (!secret) return { status: 503, error: "not_configured" };
  const ok = verifyKiraligimWebhook({
    secret,
    signature: input.headers.get("kiraligim-signature"),
    timestamp: input.headers.get("kiraligim-timestamp"),
    rawBody: input.rawBody,
    nowSeconds: input.nowSeconds,
  });
  if (!ok) return { status: 401, error: "invalid_signature" };
  let body: { id?: unknown; type?: unknown };
  try {
    body = JSON.parse(input.rawBody) as { id?: unknown; type?: unknown };
  } catch {
    return { status: 400, error: "invalid_body" };
  }
  const eventId = input.headers.get("kiraligim-event-id");
  if (typeof body.id !== "string" || !UUID.test(body.id) || body.id !== eventId) {
    return { status: 400, error: "invalid_event_id" };
  }
  if (body.type !== "calendar.changed") return { status: 204, trigger: false };
  const fresh = await rememberWebhookEvent(db, body.id);
  return { status: 204, trigger: fresh };
}
