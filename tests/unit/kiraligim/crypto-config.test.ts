import { randomBytes } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { decryptKiraligimSecret, encryptKiraligimSecret } from "@/lib/plugins/kiraligim/crypto.server";
import {
  kiraligimApiBase,
  kiraligimApiKey,
  kiraligimConfigStatus,
  kiraligimEncryptionKey,
  kiraligimWebhookUrl,
} from "@/lib/plugins/kiraligim/config.server";

const ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ENV };
});

describe("kiraligim AES-256-GCM", () => {
  it("şifreler/çözer; çıktı açık metni içermez; yanlış anahtar veya bozuk veri → null", () => {
    const key = randomBytes(32);
    const enc = encryptKiraligimSecret("whsec_abcdef", key);
    expect(enc).toMatch(/^v1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/);
    expect(enc).not.toContain("abcdef");
    expect(decryptKiraligimSecret(enc, key)).toBe("whsec_abcdef");
    expect(decryptKiraligimSecret(enc, randomBytes(32))).toBeNull();
    const parts = enc.split(":");
    parts[3] = (parts[3]![0] === "A" ? "B" : "A") + parts[3]!.slice(1);
    expect(decryptKiraligimSecret(parts.join(":"), key)).toBeNull();
    expect(decryptKiraligimSecret("garbage", key)).toBeNull();
    expect(encryptKiraligimSecret("x", key)).not.toBe(encryptKiraligimSecret("x", key)); // rastgele IV
  });
});

describe("kiraligim ortam değişkenleri", () => {
  it("tanımsız: durum missing, değerler null; varsayılan API adresi https://app.kiraligim.com", () => {
    delete process.env.KIRALIGIM_API_KEY;
    delete process.env.KIRALIGIM_ENCRYPTION_KEY;
    delete process.env.KIRALIGIM_API_BASE;
    expect(kiraligimApiKey()).toBeNull();
    expect(kiraligimEncryptionKey()).toBeNull();
    expect(kiraligimApiBase()).toBe("https://app.kiraligim.com");
    expect(kiraligimConfigStatus()).toMatchObject({ apiKey: "missing", encryptionKey: "missing", apiBaseValid: true });
  });
  it("geçersiz değerler 'invalid'; durum nesnesi hiçbir gizli değeri içermez", () => {
    process.env.KIRALIGIM_API_KEY = "kg_live_short";
    process.env.KIRALIGIM_ENCRYPTION_KEY = Buffer.alloc(16).toString("base64");
    process.env.KIRALIGIM_API_BASE = "http://app.kiraligim.com";
    const st = kiraligimConfigStatus();
    expect(st).toEqual({ apiBase: "", apiBaseValid: false, apiKey: "invalid", encryptionKey: "invalid" });
  });
  it("geçerli değerler; durum yine yalnız 'ok' döner", () => {
    const key = `kg_live_abcdefgh_${"A".repeat(43)}`;
    const enc = randomBytes(32).toString("base64");
    process.env.KIRALIGIM_API_KEY = key;
    process.env.KIRALIGIM_ENCRYPTION_KEY = enc;
    process.env.KIRALIGIM_API_BASE = "https://app.kiraligim.com/";
    expect(kiraligimApiKey()).toBe(key);
    expect(kiraligimEncryptionKey()?.length).toBe(32);
    const st = kiraligimConfigStatus();
    expect(JSON.stringify(st)).not.toContain(key);
    expect(JSON.stringify(st)).not.toContain(enc);
    expect(st).toEqual({ apiBase: "https://app.kiraligim.com", apiBaseValid: true, apiKey: "ok", encryptionKey: "ok" });
  });
  it("webhook adresi NEXT_PUBLIC_SITE_URL'den; https değilse null", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://tatilinyeri.com/";
    expect(kiraligimWebhookUrl()).toBe("https://tatilinyeri.com/api/integrations/kiraligim/webhook");
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
    expect(kiraligimWebhookUrl()).toBeNull();
  });
});
