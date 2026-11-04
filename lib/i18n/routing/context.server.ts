import "server-only";

import { getCachedSettings } from "@/lib/cache.helpers";
import { getEnabledPublicLocales, getRootLocale } from "@/lib/i18n/config";
import {
  setRoutingContext,
  type RoutingContext,
} from "@/lib/i18n/routing/context";
import {
  getCachedLocalizedSlugMap,
  getCachedRedirectMap,
} from "@/lib/i18n/routing/slug-map.server";

/* ===============================================================
   🌐 SERVER ROUTING CONTEXT — Faz 2
   ===============================================================
   Cache'li ayar + slug haritasından bağlamı kurar ve modül bağlamını
   günceller (lib/i18n/routing/context.ts). Public layout, [lang]
   route'ları, sitemap, robots ve 404 sayfası başında çağrılır.
   Hata → varsayılan bağlam (TR kök, tüm diller, slug yok).
   =============================================================== */

export async function loadRoutingContext(): Promise<RoutingContext> {
  const [settings, slugs, redirects] = await Promise.all([
    getCachedSettings().catch(() => null),
    getCachedLocalizedSlugMap().catch(() => ({})),
    getCachedRedirectMap().catch(() => ({})),
  ]);
  return {
    root: getRootLocale(settings),
    enabled: getEnabledPublicLocales(settings),
    slugs: slugs ?? {},
    redirects: redirects ?? {},
  };
}

export async function primeRoutingContext(): Promise<RoutingContext> {
  const ctx = await loadRoutingContext();
  setRoutingContext(ctx);
  return ctx;
}
