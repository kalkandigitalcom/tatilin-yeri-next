/* ===============================================================
   Kiraligim webhook imza doğrulaması (yalnız sunucu)
   ===============================================================
   Kiraligim-Signature = "v1=" + hex(HMAC-SHA256(secret, `${ts}.${rawBody}`))
   Kiraligim-Timestamp = unix saniye. ±5 dk dışı reddedilir (yeniden
   oynatma). Karşılaştırma sabit sürelidir. Ham gövde (bayt-bayt aynı)
   kullanılmalıdır; JSON yeniden yazılmaz.
=============================================================== */
import { createHmac, timingSafeEqual } from "node:crypto";

export const WEBHOOK_TOLERANCE_SECONDS = 300;

export function signKiraligimWebhook(secret: string, timestamp: number | string, rawBody: string): string {
  return "v1=" + createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
}

export function verifyKiraligimWebhook(input: {
  secret: string;
  signature: string | null;
  timestamp: string | null;
  rawBody: string;
  nowSeconds?: number;
}): boolean {
  const { secret, signature, timestamp, rawBody } = input;
  if (!secret || !signature || !timestamp) return false;
  if (!/^\d{1,12}$/.test(timestamp)) return false;
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > WEBHOOK_TOLERANCE_SECONDS) return false;
  const expected = Buffer.from(signKiraligimWebhook(secret, timestamp, rawBody), "utf8");
  const given = Buffer.from(signature, "utf8");
  return expected.length === given.length && timingSafeEqual(expected, given);
}
