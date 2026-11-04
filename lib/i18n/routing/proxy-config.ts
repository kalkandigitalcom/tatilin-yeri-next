import { Pool, type PoolConfig } from "pg";

import {
  DEFAULT_LOCALE,
  getEnabledPublicLocales,
  getRootLocale,
  type PublicLocaleState,
} from "@/lib/i18n/config";
import {
  LIVE_SLUGS_SQL,
  LOCALIZED_SLUGS_SQL,
  REDIRECTS_SQL,
  rowsToLiveSet,
  rowsToRedirectMap,
  rowsToSlugMap,
} from "@/lib/i18n/routing/sql";
import {
  DEFAULT_ROUTING_CONTEXT,
  type LiveSlugSets,
  type RoutingContext,
} from "@/lib/i18n/routing/context";

/* ===============================================================
   🌐 PROXY ROUTING CONFIG — Çok Dilli Mimari Faz 2
   ===============================================================
   `proxy.ts` (Next 16, Node runtime) her public istekte ana dili ve
   slug haritasını bilmelidir. "Proxy yavaş veri çekimi için değildir"
   (Next dokümanı) → BELLEK İÇİ CACHE (30 sn TTL):
     • Taze değer varsa sorgu YOK (isteklerin ~tamamı).
     • Süre dolunca TEK sorgu (eşzamanlı istekler aynı promise'i bekler).
     • Hata → son bilinen değer; hiç yoksa varsayılan (TR kök) →
       site bugünkü gibi çalışır.
   `server-only` modülleri import EDİLMEZ (proxy bundle'ı react-server
   koşuluyla derlenmez). Uygulamanın pg Pool'u (globalThis) varsa o
   kullanılır, yoksa küçük (max 2) ayrı bir Pool açılır.
   =============================================================== */

const TTL_MS = 30_000;
/** 404 kararından önce cache bu süreden eskiyse bir kez tazelenir
 *  (yeni yayınlanan içerik 30 sn boyunca 404 görmesin). */
export const NOT_FOUND_REFRESH_MIN_AGE_MS = 5_000;

type Entry = { value: RoutingContext; expires: number; loadedAt: number };

const g = globalThis as typeof globalThis & {
  __yazVillamPgPool?: Pool;
  __yazVillamProxyPgPool?: Pool;
  __tyLocaleRoutingCache?: Entry;
  __tyLocaleRoutingInflight?: Promise<RoutingContext>;
  /** Faz 4 — her geçersiz kılmada artar; eski nesilden dönen bir yükleme
   *  cache'e YAZILMAZ (ana dil değişiminden önce başlamış sorgu yeni
   *  ayarı 30 sn gölgeleyemez). */
  __tyLocaleRoutingGeneration?: number;
};

/** Faz 4 — ana dil / dil aç-kapa kaydından HEMEN sonra çağrılır
 *  (lib/i18n/routing/invalidate.server.ts). Aynı Node sürecindeki proxy
 *  bir sonraki istekte bağlamı DB'den yeniden okur. */
export function invalidateProxyRoutingContext(): void {
  g.__tyLocaleRoutingGeneration = (g.__tyLocaleRoutingGeneration ?? 0) + 1;
  g.__tyLocaleRoutingCache = undefined;
  g.__tyLocaleRoutingInflight = undefined;
}

function pool(): Pool | null {
  if (g.__yazVillamPgPool) return g.__yazVillamPgPool;
  if (g.__yazVillamProxyPgPool) return g.__yazVillamProxyPgPool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null;
  const mode = (process.env.PGSSLMODE || "").trim().toLowerCase();
  const ssl: PoolConfig["ssl"] =
    mode === "require"
      ? { rejectUnauthorized: false }
      : mode === "verify-full" || mode === "verify-ca"
        ? { rejectUnauthorized: true }
        : undefined;
  const created = new Pool({
    connectionString,
    max: 2,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 3_000,
    ssl,
    options: "-c search_path=public",
  });
  created.on("error", () => {});
  g.__yazVillamProxyPgPool = created;
  return created;
}

const SETTINGS_SQL = `SELECT multilingual_enabled, public_default_locale FROM public.settings LIMIT 1`;
const LOCALES_SQL = `SELECT code, is_enabled, sort_order FROM public.site_locales`;
async function load(): Promise<RoutingContext> {
  const p = pool();
  if (!p) return DEFAULT_ROUTING_CONTEXT;
  const settingsRes = await p.query(SETTINGS_SQL);
  const row = (settingsRes.rows?.[0] ?? null) as {
    multilingual_enabled?: boolean | null;
    public_default_locale?: string | null;
  } | null;

  const liveKinds = Object.keys(LIVE_SLUGS_SQL) as (keyof typeof LIVE_SLUGS_SQL)[];
  const [locRes, slugRes, redirRes, ...liveRes] = await Promise.all([
    p.query(LOCALES_SQL).catch(() => null),
    p.query(LOCALIZED_SLUGS_SQL).catch(() => null),
    p.query(REDIRECTS_SQL).catch(() => null),
    ...liveKinds.map((k) => p.query(LIVE_SLUGS_SQL[k] as string).catch(() => null)),
  ]);
  const live: LiveSlugSets = {};
  liveKinds.forEach((k, i) => {
    const res = liveRes[i];
    if (res) live[k] = rowsToLiveSet(res.rows ?? []);
  });
  const settings = {
    ...(row ?? {}),
    public_locales: (locRes?.rows as PublicLocaleState[] | undefined) ?? null,
  };

  const slugs = rowsToSlugMap(slugRes?.rows ?? []);
  const redirects = rowsToRedirectMap(redirRes?.rows ?? []);

  return {
    root: row ? getRootLocale(settings) : DEFAULT_LOCALE,
    enabled: getEnabledPublicLocales(settings),
    slugs,
    redirects,
    live,
  };
}

export async function getProxyRoutingContext(now: number = Date.now()): Promise<RoutingContext> {
  const hit = g.__tyLocaleRoutingCache;
  if (hit && hit.expires > now) return hit.value;
  return reload();
}

/** 404 vermeden önce: cache `minAgeMs`'den eskiyse tazeler, değilse
 *  mevcut değeri döndürür. */
export async function refreshProxyRoutingContext(
  minAgeMs: number = NOT_FOUND_REFRESH_MIN_AGE_MS,
  now: number = Date.now()
): Promise<RoutingContext> {
  const hit = g.__tyLocaleRoutingCache;
  if (hit && now - hit.loadedAt < minAgeMs) return hit.value;
  return reload();
}

function reload(): Promise<RoutingContext> {
  if (g.__tyLocaleRoutingInflight) return g.__tyLocaleRoutingInflight;

  const generation = g.__tyLocaleRoutingGeneration ?? 0;
  const current = () => (g.__tyLocaleRoutingGeneration ?? 0) === generation;
  const inflight: Promise<RoutingContext> = load()
    .then((value) => {
      if (current()) {
        const t = Date.now();
        g.__tyLocaleRoutingCache = { value, expires: t + TTL_MS, loadedAt: t };
      }
      return value;
    })
    .catch(() => {
      const stale = g.__tyLocaleRoutingCache?.value ?? DEFAULT_ROUTING_CONTEXT;
      if (current()) {
        const t = Date.now();
        // loadedAt = t → DB hatasında 404 tazelemesi de 5 sn'de bir kez.
        g.__tyLocaleRoutingCache = { value: stale, expires: t + 5_000, loadedAt: t };
      }
      return stale;
    })
    .finally(() => {
      if (g.__tyLocaleRoutingInflight === inflight) g.__tyLocaleRoutingInflight = undefined;
    });
  g.__tyLocaleRoutingInflight = inflight;
  return inflight;
}
