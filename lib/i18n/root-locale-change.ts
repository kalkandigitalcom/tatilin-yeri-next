import { isSupportedLocale, SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/config";
import type { RoutingContext } from "@/lib/i18n/routing/context";
import { ROUTES, type RouteKey } from "@/lib/i18n/routing/route-registry";
import { buildRoutePath, REDIRECT_STATUS, resolveIncomingPath } from "@/lib/i18n/routing/url";

/* ===============================================================
   🌐 ANA DİL DEĞİŞİMİ — doğrulama + etki planı (Faz 4, SAF)
   ===============================================================
   Admin arayüzü (önizleme) ve `/api/admin/settings/root-locale` AYNI
   fonksiyonları kullanır. DB tarafında `change_public_root_locale`
   (migration 104) aynı kuralları kilitle birlikte yeniden uygular.

   URL GEÇİŞİ ALGORİTMİKTİR: yeni bir yönlendirme tablosu yazılmaz;
   proxy her isteği o anki ana dile göre çözer
   (lib/i18n/routing/url.ts → resolveIncomingPath). `url_redirects`
   (içerik slug geçmişi) bu işleme KARIŞMAZ.
   Bu modül yalnız "eski ana dilde geçerli URL → yeni ana dilde ne
   olur" tablosunu HESAPLAR ve tek adımlı olduğunu doğrular.
   =============================================================== */

export type RootLocaleChangeState = {
  current: Locale;
  enabled: readonly Locale[];
  multilingualEnabled: boolean;
};

export type RootLocaleChangeValidation =
  | { ok: true; from: Locale; to: Locale }
  | { ok: false; error: string; code: "invalid" | "disabled" | "same" | "multilingual" | "conflict" };

/** `expected` verilirse istemcinin gördüğü ana dil ile DB'deki aynı olmalı. */
export function validateRootLocaleChange(
  input: { to: unknown; expected?: unknown },
  state: RootLocaleChangeState
): RootLocaleChangeValidation {
  const to = input.to;
  if (!isSupportedLocale(to)) {
    return { ok: false, code: "invalid", error: `Desteklenmeyen dil kodu: ${String(to)}` };
  }
  if (input.expected !== undefined && input.expected !== state.current) {
    return {
      ok: false,
      code: "conflict",
      error: "Ana dil bu sırada başka bir oturumda değiştirildi. Sayfayı yenileyip tekrar deneyin.",
    };
  }
  if (to === state.current) {
    return { ok: false, code: "same", error: "Seçilen dil zaten ana dil." };
  }
  if (to !== "tr" && !state.multilingualEnabled) {
    return {
      ok: false,
      code: "multilingual",
      error: "TR dışında bir ana dil için önce Çoklu Dil Sistemi açılıp kaydedilmelidir.",
    };
  }
  if (!state.enabled.includes(to)) {
    return { ok: false, code: "disabled", error: "Yalnız aktif bir dil ana dil yapılabilir." };
  }
  return { ok: true, from: state.current, to };
}

export type RootChangeUrlRow = {
  route: RouteKey;
  locale: Locale;
  /** Eski ana dilde bu sayfanın kanonik URL'si. */
  before: string;
  /** Yeni ana dilde kanonik URL. */
  after: string;
  /** Eski URL yeni ana dilde ne döner:
   *  same       — URL değişmedi (aynı dil, aynı adres)
   *  redirect   — tek adımda yeni URL'ye yönlenir
   *  reassigned — segmenti dillerde ORTAK olduğu için (ör. "/", "/blog")
   *               aynı adres artık YENİ ana dilin sayfasını gösterir;
   *               eski dilin sayfası `after` adresine taşınır. Yönlendirme
   *               yapılamaz (adres yeni ana dilin kanonik URL'sidir). */
  outcome: "same" | "redirect" | "reassigned";
  status?: number;
  /** language-fallback: eski URL belirsiz (ortak desen + taban slug);
   *  aynı içeriğin TR sayfasına yönlenir. */
  note?: "language-fallback";
};

export type RootChangePlan = {
  from: Locale;
  to: Locale;
  rows: RootChangeUrlRow[];
  /** Tek adım/döngü ihlalleri (boş olmalı). */
  issues: string[];
  summary: { redirected: number; reassigned: number; unchanged: number; redirectStatus: number };
};

const SAMPLE_PARAMS: Partial<Record<RouteKey, Record<string, string>>> = {
  villa: { slug: "ornek-villa" },
  villaType: { slug: "ornek-kategori" },
  region: { slug: "ornek-bolge" },
  blogPost: { slug: "ornek-yazi" },
  page: { slug: "ornek-sayfa" },
  favoritesShare: { token: "token" },
  reservation: { slug: "ornek-villa" },
  shortGaps: { ay: "2026-07", gece: "3" },
  sharedList: { token: "token" },
  privateVilla: { token: "token" },
};

/** Önizlemede gösterilecek route'lar (hepsi hesaplanır; UI özetler). */
export const PREVIEW_ROUTE_KEYS: readonly RouteKey[] = [
  "home",
  "villas",
  "villa",
  "villaType",
  "region",
  "blog",
  "blogPost",
  "page",
  "contact",
];

/** Ana dil değişiminin URL etkisi. `ctx` mevcut bağlamdır (slug'lar,
 *  aktif diller, içerik canlı kümesi olmadan). Gerçek route registry +
 *  slug eşleştirmesi kullanılır; URL elle üretilmez. */
export function planRootLocaleChange(
  ctx: RoutingContext,
  to: Locale,
  params: Partial<Record<RouteKey, Record<string, string>>> = SAMPLE_PARAMS
): RootChangePlan {
  const before: RoutingContext = { ...ctx, live: undefined };
  const after: RoutingContext = { ...before, root: to };
  const rows: RootChangeUrlRow[] = [];
  const issues: string[] = [];

  for (const r of ROUTES) {
    const p = params[r.key] ?? {};
    for (const l of SUPPORTED_LOCALES) {
      if (!ctx.enabled.includes(l)) continue;
      const oldUrl = buildRoutePath(r.key, p, l, before);
      const newUrl = buildRoutePath(r.key, p, l, after);
      const d = resolveIncomingPath(oldUrl, after);
      let outcome: RootChangeUrlRow["outcome"] = "same";
      let status: number | undefined;
      let note: RootChangeUrlRow["note"];
      let target = newUrl;
      if (oldUrl === newUrl) {
        if (d.type !== "rewrite") issues.push(`${oldUrl}: değişmemesi gerekirken ${d.type}`);
      } else if (d.type === "rewrite" && oldUrl === buildRoutePath(r.key, p, to, after)) {
        outcome = "reassigned";
      } else {
        outcome = "redirect";
        /* Aynı içeriğin başka bir aktif dildeki kanonik URL'si de kabul
           edilir: dilde ORTAK desen + taban slug (o dilin kendi slug'ı
           yoksa) eski kök URL'nin hangi dile ait olduğunu belirsiz kılar;
           proxy taban slug'ı TR sayfasına götürür. */
        const sibling =
          d.type === "redirect" &&
          ctx.enabled.some((x) => buildRoutePath(r.key, p, x, after) === d.path);
        if (d.type !== "redirect" || (d.path !== newUrl && !sibling)) {
          issues.push(`${oldUrl}: beklenen ${newUrl}, sonuç ${d.type} ${"path" in d ? d.path : ""}`);
        } else {
          if (d.path !== newUrl) {
            note = "language-fallback";
            target = d.path;
          }
          status = d.status;
          const second = resolveIncomingPath(d.path, after);
          if (second.type !== "rewrite") issues.push(`${oldUrl}: zincir (${d.path} → ${second.type})`);
        }
      }
      // Yeni kanonik URL her zaman doğrudan render edilir (döngü yok).
      const self = resolveIncomingPath(newUrl, after);
      if (self.type !== "rewrite") issues.push(`${newUrl}: yeni kanonik URL ${self.type}`);
      rows.push({
        route: r.key,
        locale: l,
        before: oldUrl,
        after: target,
        outcome,
        ...(status ? { status } : {}),
        ...(note ? { note } : {}),
      });
    }
  }

  return {
    from: ctx.root,
    to,
    rows,
    issues,
    summary: {
      redirected: rows.filter((r) => r.outcome === "redirect").length,
      reassigned: rows.filter((r) => r.outcome === "reassigned").length,
      unchanged: rows.filter((r) => r.outcome === "same").length,
      redirectStatus: REDIRECT_STATUS.localeRoot,
    },
  };
}
