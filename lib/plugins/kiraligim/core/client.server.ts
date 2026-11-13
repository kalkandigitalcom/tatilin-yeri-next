import "server-only";

/* ===============================================================
   Kiraligim API istemcisi (YALNIZ sunucu)
   ===============================================================
   • Bearer anahtar yalnız bu modülde header'a yazılır; hata nesnelerine
     ve loga anahtar, gövde veya URL sorgusu konmaz.
   • 15 sn zaman aşımı, yönlendirme izlenmez (redirect: "manual").
   • 429 → Retry-After kadar bekleyip en fazla 2 kez yeniden dener.
   • Hata: KiraligimApiError { status, code } — code API'nin hata kodu
     (unauthorized, not_found, cursor_expired, ...) ya da yerel bir kod
     (network, timeout, bad_response, not_configured).
=============================================================== */
import type {
  KiraligimAccountChanges,
  KiraligimConnection,
  KiraligimMe,
  KiraligimProperty,
  KiraligimSnapshot,
  KiraligimWebhook,
} from "./types";

export class KiraligimApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`kiraligim_api_${code}`);
    this.name = "KiraligimApiError";
  }
}

export type KiraligimFetch = typeof fetch;

export type KiraligimClientOptions = {
  base: string;
  apiKey: string;
  fetchImpl?: KiraligimFetch;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

const sleepDefault = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createKiraligimClient(opts: KiraligimClientOptions) {
  const doFetch = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const sleep = opts.sleep ?? sleepDefault;

  async function request<T>(method: string, path: string, body?: unknown): Promise<{ status: number; data: T }> {
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await doFetch(opts.base + path, {
          method,
          headers: {
            authorization: `Bearer ${opts.apiKey}`,
            accept: "application/json",
            ...(body !== undefined ? { "content-type": "application/json" } : {}),
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
          redirect: "manual",
          cache: "no-store",
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        const name = err instanceof Error ? err.name : "";
        throw new KiraligimApiError(0, name === "TimeoutError" || name === "AbortError" ? "timeout" : "network");
      }
      if (res.status === 429 && attempt < 2) {
        const wait = Math.min(Number(res.headers.get("retry-after")) || 5, 60);
        await res.body?.cancel().catch(() => undefined);
        await sleep(wait * 1000);
        continue;
      }
      let json: unknown = null;
      try {
        json = await res.json();
      } catch {
        json = null;
      }
      if (res.status >= 200 && res.status < 300) {
        if (json === null || typeof json !== "object") throw new KiraligimApiError(res.status, "bad_response");
        return { status: res.status, data: json as T };
      }
      const code =
        json && typeof json === "object" && "error" in json && (json as { error?: { code?: unknown } }).error?.code;
      throw new KiraligimApiError(res.status, typeof code === "string" && /^[a-z_]{1,64}$/.test(code) ? code : `http_${res.status}`);
    }
  }

  const enc = encodeURIComponent;
  return {
    me: () => request<KiraligimMe>("GET", "/api/v1/me").then((r) => r.data),
    properties: async (): Promise<KiraligimProperty[]> => {
      const out: KiraligimProperty[] = [];
      let cursor: string | null = null;
      for (let i = 0; i < 50; i++) {
        const q: string = `?limit=500${cursor ? `&cursor=${enc(cursor)}` : ""}`;
        const r = await request<{ data: KiraligimProperty[]; next_cursor: string | null }>("GET", `/api/v1/properties${q}`);
        out.push(...r.data.data.map((p) => ({ id: p.id, name: p.name })));
        if (!r.data.next_cursor) break;
        cursor = r.data.next_cursor;
      }
      return out;
    },
    connect: (propertyId: string, externalPropertyId: string) =>
      request<KiraligimConnection>("POST", "/api/v1/calendar-connections", {
        property_id: propertyId,
        external_property_id: externalPropertyId,
      }),
    connection: (id: string) => request<KiraligimConnection>("GET", `/api/v1/calendar-connections/${enc(id)}`).then((r) => r.data),
    disconnect: (id: string) => request<KiraligimConnection>("DELETE", `/api/v1/calendar-connections/${enc(id)}`).then((r) => r.data),
    snapshot: (id: string) =>
      request<KiraligimSnapshot>("GET", `/api/v1/calendar-connections/${enc(id)}/snapshot`).then((r) => r.data),
    accountChanges: (cursor: string | null, limit = 200) =>
      request<KiraligimAccountChanges>(
        "GET",
        `/api/v1/calendar-changes?limit=${limit}${cursor ? `&cursor=${enc(cursor)}` : ""}`,
      ).then((r) => r.data),
    webhook: () => request<KiraligimWebhook>("GET", "/api/v1/webhook").then((r) => r.data),
    putWebhook: (url: string) => request<KiraligimWebhook>("PUT", "/api/v1/webhook", { url }),
    deleteWebhook: () => request<{ deleted: true }>("DELETE", "/api/v1/webhook").then((r) => r.data),
    rotateWebhookSecret: () =>
      request<{ secret: string; secret_rotated_at: string }>("POST", "/api/v1/webhook/rotate-secret").then((r) => r.data),
  };
}

export type KiraligimClient = ReturnType<typeof createKiraligimClient>;
