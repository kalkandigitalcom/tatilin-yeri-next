import "server-only";

/* AES-256-GCM: "v1:<iv b64url>:<tag b64url>:<ct b64url>". Anahtar
   KIRALIGIM_ENCRYPTION_KEY. Yanlış anahtar / bozuk veri → null
   (ayrıntı sızdırılmaz). */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export function encryptKiraligimSecret(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), ct.toString("base64url")].join(":");
}

export function decryptKiraligimSecret(enc: string, key: Buffer): string | null {
  const [v, iv, tag, ct] = (enc || "").split(":");
  if (v !== "v1" || !iv || !tag || !ct) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
