import { describe, expect, it } from "vitest";

import { signKiraligimWebhook, verifyKiraligimWebhook } from "@/lib/plugins/kiraligim/core/webhook-verify";

const secret = "whsec_test_secret_value";
const body = '{"id":"0198f3a0-0000-7000-8000-000000000001","type":"calendar.changed"}';
const ts = "1767225600";
const sig = signKiraligimWebhook(secret, ts, body);
const ok = (o: Partial<Parameters<typeof verifyKiraligimWebhook>[0]>) =>
  verifyKiraligimWebhook({ secret, signature: sig, timestamp: ts, rawBody: body, nowSeconds: 1767225700, ...o });

describe("kiraligim webhook imzası", () => {
  it("biçim v1=<64 hex>; Kiraligim'in imzasıyla birebir (HMAC-SHA256(secret, ts.body))", () => {
    expect(sig).toMatch(/^v1=[0-9a-f]{64}$/);
    expect(ok({})).toBe(true);
  });
  it("değiştirilmiş gövde, başka secret, değiştirilmiş zaman damgası reddedilir", () => {
    expect(ok({ rawBody: body.replace("changed", "changes") })).toBe(false);
    expect(ok({ secret: "whsec_other" })).toBe(false);
    expect(ok({ timestamp: "1767225601" })).toBe(false);
  });
  it("5 dakikadan eski / ilerideki zaman damgası reddedilir (yeniden oynatma)", () => {
    expect(ok({ nowSeconds: 1767225600 + 301 })).toBe(false);
    expect(ok({ nowSeconds: 1767225600 - 301 })).toBe(false);
    expect(ok({ nowSeconds: 1767225600 + 300 })).toBe(true);
  });
  it("eksik / bozuk başlıklar reddedilir", () => {
    expect(ok({ signature: null })).toBe(false);
    expect(ok({ timestamp: null })).toBe(false);
    expect(ok({ timestamp: "12a" })).toBe(false);
    expect(ok({ signature: "v1=abc" })).toBe(false);
    expect(ok({ secret: "" })).toBe(false);
  });
});
