import { isSupportedLocale, SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/config";
import {
  getRoutingContext,
  ownHistoryHasTechnicalKey,
  slugOwnerLocale,
  slugSource,
  toBaseSlug,
  toLocalizedSlug,
  type RoutingContext,
} from "@/lib/i18n/routing/context";
import {
  ROUTES,
  ROUTE_BY_KEY,
  type RouteDef,
  type RouteKey,
} from "@/lib/i18n/routing/route-registry";

/* ===============================================================
   🌐 MERKEZİ URL ÜRETİMİ VE ÇÖZÜMLEME — Çok Dilli Mimari Faz 2
   ===============================================================
   KURAL:
     • Ana dil (ctx.root) kök URL'de, öneksiz:      /villas-for-rent
     • Diğer diller kendi koduyla önekli:          /tr/kiralik-villalar
     • Yol segmentleri ve içerik slug'ları dile göre (route-registry +
       çeviri slug'ları).
     • İÇ YOL (Next route ağacı): /<dil>/<TR deseni> —
       app/(public)/[lang]/... ; proxy public URL'yi buraya rewrite eder.

   Bu dosya SAF ve senkrondur (server, client, proxy, test). Bağlam
   verilmezse `getRoutingContext()` kullanılır.
   =============================================================== */

export type RouteParams = Record<string, string>;

export type RouteMatch = {
  key: RouteKey;
  /** Ham parametreler (slug, URL'de geldiği haliyle). */
  params: RouteParams;
  /** Desenin ait olduğu dil. */
  patternLocale: Locale;
};

function splitPath(path: string): string[] {
  return path.split("/").filter((s) => s.length > 0);
}

function splitHref(href: string): { path: string; suffix: string } {
  const cut = href.search(/[?#]/);
  return cut === -1
    ? { path: href, suffix: "" }
    : { path: href.slice(0, cut), suffix: href.slice(cut) };
}

function matchPattern(pattern: string, segs: string[]): RouteParams | null {
  const parts = splitPath(pattern);
  if (parts.length !== segs.length) return null;
  const params: RouteParams = {};
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p.startsWith(":")) {
      if (!segs[i]) return null;
      params[p.slice(1)] = segs[i];
    } else if (p !== segs[i]) {
      return null;
    }
  }
  return params;
}

/** Segmentleri, verilen dilin desenleriyle eşleştirir. */
export function matchRoute(segs: string[], locale: Locale): RouteMatch | null {
  for (const r of ROUTES) {
    const params = matchPattern(r.patterns[locale], segs);
    if (params) return { key: r.key, params, patternLocale: locale };
  }
  return null;
}

/** Önce tercih edilen dil, sonra diğer diller. */
export function matchRouteAnyLocale(
  segs: string[],
  preferred: Locale
): RouteMatch | null {
  const own = matchRoute(segs, preferred);
  if (own) return own;
  for (const l of SUPPORTED_LOCALES) {
    if (l === preferred) continue;
    const m = matchRoute(segs, l);
    if (m) return m;
  }
  return null;
}

function fillPattern(pattern: string, params: RouteParams): string {
  return splitPath(pattern)
    .map((p) => (p.startsWith(":") ? params[p.slice(1)] ?? "" : p))
    .join("/");
}

function localePrefix(locale: Locale, ctx: RoutingContext): string {
  return locale === ctx.root ? "" : `/${locale}`;
}

/** Parametrelerdeki slug'ı taban slug'a normalize eder. */
function normalizeParams(
  def: RouteDef,
  params: RouteParams,
  fromLocale: Locale,
  ctx: RoutingContext
): RouteParams {
  if (!def.slugKind || !params.slug) return params;
  return { ...params, slug: toBaseSlug(ctx, def.slugKind, params.slug, fromLocale) };
}

/** Route anahtarı + TABAN parametrelerden PUBLIC yol üretir. */
export function buildRoutePath(
  key: RouteKey,
  params: RouteParams,
  locale: Locale,
  ctx: RoutingContext = getRoutingContext()
): string {
  const def = ROUTE_BY_KEY[key];
  const p =
    def.slugKind && params.slug
      ? { ...params, slug: toLocalizedSlug(ctx, def.slugKind, params.slug, locale) }
      : params;
  const body = fillPattern(def.patterns[locale], p);
  const prefix = localePrefix(locale, ctx);
  if (!body) return prefix || "/";
  return `${prefix}/${body}`;
}

/** Route anahtarı + TABAN parametrelerden İÇ (Next) yol üretir. */
export function buildInternalPath(
  key: RouteKey,
  params: RouteParams,
  locale: Locale
): string {
  const body = fillPattern(ROUTE_BY_KEY[key].patterns.tr, params);
  return body ? `/${locale}/${body}` : `/${locale}`;
}

export type ParsedPath = {
  /** Yolun dili (önek varsa önek, yoksa ana dil). */
  locale: Locale;
  prefixed: boolean;
  /** Önek sonrası segmentler. */
  rest: string[];
  /** Eşleşen route (yolun dilinde veya başka bir dilin deseninde). */
  match: RouteMatch | null;
};

/** Public VEYA iç yolu çözümler (önek: tr/en/de; yoksa ana dil). */
export function parsePath(
  pathname: string,
  ctx: RoutingContext = getRoutingContext()
): ParsedPath {
  const segs = splitPath(splitHref(pathname || "/").path);
  const first = segs[0];
  const prefixed = !!first && isSupportedLocale(first);
  const locale: Locale = prefixed ? (first as Locale) : ctx.root;
  const rest = prefixed ? segs.slice(1) : segs;
  return { locale, prefixed, rest, match: matchRouteAnyLocale(rest, locale) };
}

/** Bir yolun route anahtarı + TABAN parametreleri (yoksa null). */
export function resolveRoute(
  pathname: string,
  ctx: RoutingContext = getRoutingContext()
): { key: RouteKey; params: RouteParams; locale: Locale } | null {
  const parsed = parsePath(pathname, ctx);
  if (!parsed.match) return null;
  const def = ROUTE_BY_KEY[parsed.match.key];
  return {
    key: parsed.match.key,
    params: normalizeParams(def, parsed.match.params, parsed.locale, ctx),
    locale: parsed.locale,
  };
}

/** Yolun dili (client bileşenleri: usePathname + ana dil).
 *  Kapalı bir dilin önekli yolu (yalnız 404 render edilir) → ana dil:
 *  header/footer/404 gövdesi kapalı dilin (yine 404 olan) linklerini
 *  üretmez. */
export function localeOfPath(
  pathname: string | null | undefined,
  ctx: RoutingContext = getRoutingContext()
): Locale {
  const locale = parsePath(pathname || "/", ctx).locale;
  return ctx.enabled.includes(locale) ? locale : ctx.root;
}

/** Herhangi bir dildeki yolu TR (taban) karşılaştırma yoluna çevirir:
 *  "/en/villas-for-rent" → "/kiralik-villalar". Eşleşmeyen yol önek
 *  soyularak aynen döner. Aktif menü tespiti vb. için. */
export function toBaseRoutePath(
  pathname: string | null | undefined,
  ctx: RoutingContext = getRoutingContext()
): string {
  const parsed = parsePath(pathname || "/", ctx);
  if (!parsed.match) {
    return parsed.rest.length ? `/${parsed.rest.join("/")}` : "/";
  }
  const def = ROUTE_BY_KEY[parsed.match.key];
  const params = normalizeParams(def, parsed.match.params, parsed.locale, ctx);
  const body = fillPattern(def.patterns.tr, params);
  return body ? `/${body}` : "/";
}

/** TR biçimli (veya herhangi bir dildeki) iç link'i hedef dilin
 *  PUBLIC URL'sine çevirir. Query/hash AYNEN korunur. Kayıtta olmayan
 *  yol: yalnız dil öneki uygulanır (eski davranış). */
export function localizeHref(
  href: string,
  locale: Locale,
  ctx: RoutingContext = getRoutingContext()
): string {
  const { path, suffix } = splitHref(href);
  const segs = splitPath(path);
  const first = segs[0];
  const hadPrefix = !!first && isSupportedLocale(first);
  const sourceLocale: Locale = hadPrefix ? (first as Locale) : "tr";
  const rest = hadPrefix ? segs.slice(1) : segs;
  const m = matchRouteAnyLocale(rest, sourceLocale);
  if (m) {
    const def = ROUTE_BY_KEY[m.key];
    const params = normalizeParams(def, m.params, m.patternLocale, ctx);
    return `${buildRoutePath(m.key, params, locale, ctx)}${suffix}`;
  }
  const body = rest.join("/");
  const prefix = localePrefix(locale, ctx);
  const out = body ? `${prefix}/${body}` : prefix || "/";
  return `${out}${suffix}`;
}

/* ===============================================================
   PROXY KARARI — gelen public istek
   =============================================================== */

export type IncomingDecision =
  | { type: "rewrite"; path: string }
  | { type: "redirect"; path: string; status: 307 | 308 };

/** Faz 3 son kontrol — proxy düzeyinde 404 kararı.
 *  `path` HİÇBİR route'a uymayan iç yoldur (/<dil>/__404__) → Next bunu
 *  `global-not-found` ile GERÇEK SSR + HTTP 404 olarak render eder
 *  (sayfa içinde fırlatılan notFound() Next 16'da `__next_error__`
 *  kabuğu + client render üretir). `locale` 404 gövdesinin dilidir. */
export type NotFoundDecision = {
  type: "notFound";
  path: string;
  locale: Locale;
  reason: "disabledLocale" | "noRoute" | "noContent";
};

export type ProxyDecision = IncomingDecision | NotFoundDecision;

/** 404 iç yolu: tek segmentli, (site) altında eşleşen route YOK. */
export const NOT_FOUND_SEGMENT = "__404__";
/** Proxy → global-not-found: 404 gövdesinin dili (istek header'ı). */
export const NOT_FOUND_LOCALE_HEADER = "x-ty-404-locale";

function notFoundDecision(locale: Locale, reason: NotFoundDecision["reason"]): NotFoundDecision {
  return { type: "notFound", path: `/${locale}/${NOT_FOUND_SEGMENT}`, locale, reason };
}

/** İçeriği yayında değilse proxy'nin doğrudan 404 verdiği route'lar.
 *  Rezervasyon / token / taksonomi route'ları BİLEREK dışarıda (kendi
 *  iş kuralları sayfada kalır). */
const CONTENT_404_ROUTES: ReadonlySet<RouteKey> = new Set<RouteKey>([
  "villa",
  "blogPost",
  "page",
]);

function safeDecode(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

/** Taban slug yayında mı? Küme yoksa (sorgu başarısız / server bağlamı)
 *  kontrol yapılmaz → true. */
function isLiveContent(key: RouteKey, baseSlug: string | undefined, ctx: RoutingContext): boolean {
  if (!CONTENT_404_ROUTES.has(key) || !baseSlug) return true;
  const kind = ROUTE_BY_KEY[key].slugKind;
  const set = kind ? ctx.live?.[kind] : undefined;
  if (!set) return true;
  return set.has(baseSlug) || set.has(safeDecode(baseSlug));
}

/** Redirect durum kodları (Faz 4 geçiş politikası burada değişir). */
export const REDIRECT_STATUS = {
  /** Aynı dilde eski desen/slug → yeni kanonik (kalıcı). */
  canonical: 308,
  /** Ana dil öneki / dil tahmini (ana dil değişimine bağlı, geçici). */
  localeRoot: 307,
} as const;

/** Public yolu iç yola rewrite eder veya kanonik URL'ye yönlendirir.
 *  Döngü olmaz: yönlendirme hedefi daima `buildRoutePath` çıktısıdır
 *  ve bu çıktı tekrar çözümlendiğinde "rewrite" üretir (testli). */
export function resolveIncomingPath(
  pathname: string,
  ctx: RoutingContext = getRoutingContext()
): ProxyDecision {
  const segs = splitPath(pathname);
  const first = segs[0];
  const prefixed = !!first && isSupportedLocale(first);
  const locale: Locale = prefixed ? (first as Locale) : ctx.root;
  const rest = prefixed ? segs.slice(1) : segs;

  const own = matchRoute(rest, locale);
  const any = own ?? matchRouteAnyLocale(rest, locale);

  // Ana dil önekli geldiyse önek soyulur (/tr/x → /x, ana dil TR iken).
  if (prefixed && locale === ctx.root) {
    if (any) {
      const def = ROUTE_BY_KEY[any.key];
      const params = normalizeParams(def, any.params, any.patternLocale, ctx);
      return {
        type: "redirect",
        path: buildRoutePath(any.key, params, locale, ctx),
        status: REDIRECT_STATUS.localeRoot,
      };
    }
    return {
      type: "redirect",
      path: rest.length ? `/${rest.join("/")}` : "/",
      status: REDIRECT_STATUS.localeRoot,
    };
  }

  // Kapalı dilin önekli her yolu → 404 (ana dilde gövde, yönlendirme yok).
  if (prefixed && !ctx.enabled.includes(locale)) {
    return notFoundDecision(ctx.root, "disabledLocale");
  }

  if (own) {
    const def = ROUTE_BY_KEY[own.key];
    const base = normalizeParams(def, own.params, locale, ctx);
    const canonical = buildRoutePath(own.key, base, locale, ctx);
    if (canonical !== normalizePath(pathname)) {
      /* Faz 4 — öneksiz (ana dile bağlı) yolda BAŞKA dilin slug'ı:
         • Segment o dilde de AYNI ise (ör. /blog/<tr-slug>, ana dil EN):
           URL, ana dil değişmeden önce o dilin kök URL'siydi → o dilin
           sayfasına (/tr/blog/<tr-slug>) yönlenir; dil değişmez.
         • Her durumda yönlendirme ana dile bağlıdır → geçici (307):
           geri alındığında önbellekte kalıcı yönlendirme döngü yapmaz. */
      if (!prefixed && def.slugKind && own.params.slug) {
        const src = slugSource(ctx, def.slugKind, own.params.slug, locale);
        if (src === "other" || src === "base") {
          /* Faz 7 R-B — teknik anahtar bu dilin KENDİ geçmişinde: dil slug'ı
             kalıcı olarak değişti (ör. 108 sonrası TR slug'ı) → aynı dilin
             yeni slug'ına KALICI 308; başka dile gönderilmez. */
          if (src === "base" && ownHistoryHasTechnicalKey(ctx, def.slugKind, own.params.slug, locale)) {
            return { type: "redirect", path: canonical, status: REDIRECT_STATUS.canonical };
          }
          const owner = slugOwnerLocale(ctx, def.slugKind, own.params.slug, locale);
          const sameShape = owner ? matchRoute(rest, owner)?.key === own.key : false;
          const toOwner = !!owner && sameShape && ctx.enabled.includes(owner);
          const path = toOwner ? buildRoutePath(own.key, base, owner!, ctx) : canonical;
          /* Başka dile gidiş ana dile bağlıdır → geçici 307. Teknik anahtardan
             AYNI dilin kanonik slug'ına düzeltme ise kalıcıdır → 308. */
          const status =
            !toOwner && src === "base" ? REDIRECT_STATUS.canonical : REDIRECT_STATUS.localeRoot;
          return { type: "redirect", path, status };
        }
      }
      return { type: "redirect", path: canonical, status: REDIRECT_STATUS.canonical };
    }
    if (!isLiveContent(own.key, base.slug, ctx)) {
      return notFoundDecision(locale, "noContent");
    }
    return { type: "rewrite", path: buildInternalPath(own.key, own.params, locale) };
  }

  if (any) {
    const def = ROUTE_BY_KEY[any.key];
    // Önekli: önek dili esas (eski desen → aynı dilin yeni deseni).
    // Öneksiz: desenin dili esas (ör. ana dil değişince eski TR kök URL).
    let patternLocale: Locale = any.patternLocale;
    /* Faz 4 — öneksiz yolda desen BİRDEN FAZLA dilde aynıysa (ör. EN ve
       DE'de "villa/:slug") dil, slug'ın SAHİBİNE göre seçilir: eski DE
       kök URL'si /villa/meer-villa → /de/villa/meer-villa (EN'ye değil). */
    if (!prefixed && def.slugKind && any.params.slug) {
      const kind = def.slugKind;
      const slug = any.params.slug;
      /* Faz 6 Dalga 1 — simetrik: sahip, slug'ı KANONİK olarak kullanan
         AKTİF dildir (kendi slug'ı ya da kendi slug'ı yoksa teknik
         anahtar). TR'ye özel kural ve pasif dil yok. */
      const owner = SUPPORTED_LOCALES.find(
        (l) =>
          l !== locale &&
          ctx.enabled.includes(l) &&
          matchRoute(rest, l)?.key === any.key &&
          slugSource(ctx, kind, slug, l) === "own"
      );
      if (owner) patternLocale = owner;
    }
    const target: Locale = prefixed ? locale : patternLocale;
    if (!ctx.enabled.includes(target)) {
      return notFoundDecision(locale, "noRoute");
    }
    const params = normalizeParams(def, any.params, patternLocale, ctx);
    return {
      type: "redirect",
      path: buildRoutePath(any.key, params, target, ctx),
      status: prefixed ? REDIRECT_STATUS.canonical : REDIRECT_STATUS.localeRoot,
    };
  }

  // Bilinmeyen yol → 404.
  return notFoundDecision(locale, "noRoute");
}

function normalizePath(pathname: string): string {
  const segs = splitPath(pathname);
  return segs.length ? `/${segs.join("/")}` : "/";
}
