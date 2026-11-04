import "server-only";

import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import type { ComponentType } from "react";

import { isSupportedLocale, type Locale } from "@/lib/i18n/config";
import { getRoutingContext, toBaseSlug, toLocalizedSlug } from "@/lib/i18n/routing/context";
import { LOCALE_META } from "@/lib/i18n/locale-registry";
import { primeRoutingContext } from "@/lib/i18n/routing/context.server";
import { ROUTE_BY_KEY, type RouteKey } from "@/lib/i18n/routing/route-registry";
import { buildRoutePath } from "@/lib/i18n/routing/url";

/* ===============================================================
   🌐 LOCALE ROUTE DISPATCHER — Çok Dilli Mimari Faz 2
   ===============================================================
   `app/(public)/[lang]/<TR deseni>/page.tsx` dosyaları bu yardımcıyı
   kullanır. Her dilin MEVCUT sayfa modülü (`locale-page.tsx`) AYNEN
   korunur ve değiştirilmeden render edilir — veri çekimi, rezervasyon,
   fiyat, metadata ve iş kuralları dile göre önceki dosyalarındadır.

   Dispatcher'ın tek işi:
     1) `lang` doğrulama → desteklenmeyen / kapalı dil: 404 (+noindex)
     2) Routing bağlamını kurmak (ana dil, aktif diller, slug haritası)
     3) Dil slug'ını TABAN (TR) slug'a çevirmek → modül her zaman
        bugünkü slug ile çalışır (getVillaBySlug vb. DEĞİŞMEDİ)
     4) URL'deki slug o dilin kanonik slug'ı değilse → 308 kanonik URL
        (proxy normalde bunu zaten yapar; bu bir güvenlik ağıdır)
   =============================================================== */

type RouteProps = {
  params: Promise<Record<string, string>>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type ModuleProps = {
  params: Promise<Record<string, string>>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export type LocalePageModule = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: ComponentType<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  generateMetadata?: (props: any) => Promise<Metadata> | Metadata;
  metadata?: Metadata;
};

type Prepared =
  | { kind: "ok"; lang: Locale; params: Record<string, string> }
  | { kind: "redirect"; path: string };

async function prepare(key: RouteKey, props: RouteProps): Promise<Prepared> {
  const all = await props.params;
  const { lang, ...rest } = all;
  if (!isSupportedLocale(lang)) notFound();

  const ctx = await primeRoutingContext();
  if (!ctx.enabled.includes(lang)) notFound();

  const slugKind = ROUTE_BY_KEY[key].slugKind;
  if (!slugKind || !rest.slug) return { kind: "ok", lang, params: rest };

  const base = toBaseSlug(ctx, slugKind, rest.slug, lang);
  const params = { ...rest, slug: base };
  const canonical = toLocalizedSlug(ctx, slugKind, base, lang);
  if (canonical !== rest.slug) {
    return { kind: "redirect", path: buildRoutePath(key, params, lang, ctx) };
  }
  return { kind: "ok", lang, params };
}

/* 🌐 Faz 3 — sayfa kendi openGraph'ını verdiyse (layout'unkini ezer)
   og:locale + og:locale:alternate (yalnız AKTİF diller) buraya eklenir.
   openGraph yoksa root layout'un varsayılan openGraph'ı zaten içerir. */
export function withOpenGraphLocale(
  meta: Metadata,
  lang: Locale,
  enabled: readonly Locale[]
): Metadata {
  if (!meta.openGraph) return meta;
  const alternateLocale = enabled
    .filter((l) => l !== lang)
    .map((l) => LOCALE_META[l].ogLocale);
  return {
    ...meta,
    openGraph: {
      ...meta.openGraph,
      locale: LOCALE_META[lang].ogLocale,
      ...(alternateLocale.length ? { alternateLocale } : {}),
    },
  };
}

function toQuery(sp: Record<string, string | string[] | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp ?? {})) {
    if (Array.isArray(v)) v.forEach((x) => q.append(k, x));
    else if (v !== undefined) q.append(k, v);
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function localeRoute(key: RouteKey, modules: Record<Locale, LocalePageModule>) {
  async function Page(props: RouteProps) {
    const r = await prepare(key, props);
    if (r.kind === "redirect") {
      permanentRedirect(`${r.path}${toQuery(await props.searchParams)}`);
    }
    const Mod = modules[r.lang].default;
    const moduleProps: ModuleProps = {
      params: Promise.resolve(r.params),
      searchParams: props.searchParams,
    };
    return <Mod {...moduleProps} />;
  }

  async function generateMetadata(props: RouteProps): Promise<Metadata> {
    const r = await prepare(key, props);
    if (r.kind === "redirect") return {};
    const mod = modules[r.lang];
    const meta = mod.generateMetadata
      ? await mod.generateMetadata({
          params: Promise.resolve(r.params),
          searchParams: props.searchParams,
        })
      : mod.metadata ?? {};
    return withOpenGraphLocale(meta, r.lang, getRoutingContext().enabled);
  }

  return { Page, generateMetadata };
}
