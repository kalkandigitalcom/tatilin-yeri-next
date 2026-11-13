import "server-only";

/* ===============================================================
   Kiraligim eklentisi — ortam değişkenleri (YALNIZ sunucu)
   ===============================================================
   KIRALIGIM_API_BASE         https://app.kiraligim.com (varsayılan)
   KIRALIGIM_API_KEY          kg_live_xxxxxxxx_<43> — acente API anahtarı
   KIRALIGIM_ENCRYPTION_KEY   base64, tam 32 bayt — webhook secret'ını
                              veritabanında AES-256-GCM ile şifreler
   Değerler hiçbir zaman istemciye, loga veya hata mesajına yazılmaz;
   istemciye yalnız "tanımlı / tanımsız / geçersiz" bilgisi gider.
=============================================================== */

const DEFAULT_BASE = "https://app.kiraligim.com";
const KEY_RE = /^kg_live_[a-z2-7]{8}_[A-Za-z0-9_-]{43}$/;

export type KiraligimConfigStatus = {
  apiBase: string;
  apiBaseValid: boolean;
  apiKey: "ok" | "missing" | "invalid";
  encryptionKey: "ok" | "missing" | "invalid";
};

export function kiraligimApiBase(): string | null {
  const raw = (process.env.KIRALIGIM_API_BASE || DEFAULT_BASE).trim().replace(/\/+$/, "");
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.username || u.password || u.search || u.hash) return null;
    return u.origin + (u.pathname === "/" ? "" : u.pathname);
  } catch {
    return null;
  }
}

export function kiraligimApiKey(): string | null {
  const k = (process.env.KIRALIGIM_API_KEY || "").trim();
  return KEY_RE.test(k) ? k : null;
}

export function kiraligimEncryptionKey(): Buffer | null {
  const raw = (process.env.KIRALIGIM_ENCRYPTION_KEY || "").trim();
  if (!raw) return null;
  const key = Buffer.from(raw, "base64");
  return key.length === 32 ? key : null;
}

export function kiraligimConfigStatus(): KiraligimConfigStatus {
  const base = kiraligimApiBase();
  const rawKey = (process.env.KIRALIGIM_API_KEY || "").trim();
  const rawEnc = (process.env.KIRALIGIM_ENCRYPTION_KEY || "").trim();
  return {
    apiBase: base ?? "",
    apiBaseValid: base !== null,
    apiKey: !rawKey ? "missing" : kiraligimApiKey() ? "ok" : "invalid",
    encryptionKey: !rawEnc ? "missing" : kiraligimEncryptionKey() ? "ok" : "invalid",
  };
}

/** Webhook alıcısının public adresi (NEXT_PUBLIC_SITE_URL üzerinden). */
export function kiraligimWebhookUrl(): string | null {
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "").trim().replace(/\/+$/, "");
  try {
    const u = new URL(site);
    if (u.protocol !== "https:") return null;
    return `${u.origin}/api/integrations/kiraligim/webhook`;
  } catch {
    return null;
  }
}
