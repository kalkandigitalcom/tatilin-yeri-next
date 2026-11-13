import { describe, expect, it, vi } from "vitest";

import { createKiraligimClient, KiraligimApiError } from "@/lib/plugins/kiraligim/core/client.server";

const KEY = `kg_live_abcdefgh_${"B".repeat(43)}`;
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

describe("kiraligim API istemcisi", () => {
  it("Bearer anahtar header'da; sorguda anahtar yok; yönlendirme izlenmez", async () => {
    const f = vi.fn(async () => json(200, { id: "a", name: "Tatilin Yeri", rate_limit: { limit: 120, window_seconds: 60 } }));
    const c = createKiraligimClient({ base: "https://app.kiraligim.com", apiKey: KEY, fetchImpl: f as unknown as typeof fetch });
    expect((await c.me()).name).toBe("Tatilin Yeri");
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://app.kiraligim.com/api/v1/me");
    expect(url).not.toContain(KEY);
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${KEY}`);
    expect(init.redirect).toBe("manual");
  });

  it("API hata kodunu taşır; hata mesajı anahtar/gövde içermez", async () => {
    const f = vi.fn(async () => json(410, { error: { code: "cursor_expired", message: "secret detail" } }));
    const c = createKiraligimClient({ base: "https://x.test", apiKey: KEY, fetchImpl: f as unknown as typeof fetch });
    const err = await c.accountChanges("a1.x").catch((e) => e);
    expect(err).toBeInstanceOf(KiraligimApiError);
    expect(err).toMatchObject({ status: 410, code: "cursor_expired" });
    expect(String(err.message)).not.toContain(KEY);
    expect(String(err.message)).not.toContain("secret detail");
  });

  it("429 → Retry-After kadar bekleyip yeniden dener", async () => {
    const sleep = vi.fn(async () => undefined);
    const f = vi
      .fn()
      .mockResolvedValueOnce(json(429, { error: { code: "rate_limited" } }, { "retry-after": "7" }))
      .mockResolvedValueOnce(json(200, { data: [{ id: "p1", name: "Villa" }], next_cursor: null }));
    const c = createKiraligimClient({ base: "https://x.test", apiKey: KEY, fetchImpl: f as unknown as typeof fetch, sleep });
    expect(await c.properties()).toEqual([{ id: "p1", name: "Villa" }]);
    expect(sleep).toHaveBeenCalledWith(7000);
  });

  it("ağ hatası ve zaman aşımı kısa kodla döner", async () => {
    const net = createKiraligimClient({
      base: "https://x.test",
      apiKey: KEY,
      fetchImpl: (async () => {
        throw new TypeError("fetch failed");
      }) as unknown as typeof fetch,
    });
    await expect(net.me()).rejects.toMatchObject({ code: "network" });
    const to = createKiraligimClient({
      base: "https://x.test",
      apiKey: KEY,
      fetchImpl: (async () => {
        throw Object.assign(new Error("t"), { name: "TimeoutError" });
      }) as unknown as typeof fetch,
    });
    await expect(to.me()).rejects.toMatchObject({ code: "timeout" });
  });

  it("3xx yanıt başarı sayılmaz", async () => {
    const f = vi.fn(async () => new Response(null, { status: 302, headers: { location: "https://evil.test" } }));
    const c = createKiraligimClient({ base: "https://x.test", apiKey: KEY, fetchImpl: f as unknown as typeof fetch });
    await expect(c.me()).rejects.toMatchObject({ status: 302, code: "http_302" });
  });

  it("bağlantı isteği gövdesi yalnız property_id + external_property_id", async () => {
    const f = vi.fn(async () =>
      json(201, { id: "c1", property_id: "p1", external_property_id: "v1", status: "active" }),
    );
    const c = createKiraligimClient({ base: "https://x.test", apiKey: KEY, fetchImpl: f as unknown as typeof fetch });
    const r = await c.connect("p1", "v1");
    expect(r.status).toBe(201);
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(JSON.parse(String(init.body))).toEqual({ property_id: "p1", external_property_id: "v1" });
  });
});
