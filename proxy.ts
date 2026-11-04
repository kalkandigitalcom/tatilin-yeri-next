import { NextResponse, type NextRequest } from "next/server";

import {
  getProxyRoutingContext,
  refreshProxyRoutingContext,
} from "@/lib/i18n/routing/proxy-config";
import { NOT_FOUND_LOCALE_HEADER, resolveIncomingPath } from "@/lib/i18n/routing/url";

import { verifyAccessToken } from "@/lib/auth/native/jwt";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/auth/native/cookie-names";

/* ===============================================================
   🌐 PROXY (Next 16) — eski `middleware.ts`. İki görev:
     1) /maki-admin/*  → admin oturum kapısı (DEĞİŞMEDİ, aşağıda)
     2) public sayfalar → çok dilli URL çözümü (Çok Dilli Mimari Faz 2):
        public SEO URL'si iç route ağacına (app/(public)/[lang]/…)
        rewrite edilir veya kanonik URL'ye yönlendirilir
        (lib/i18n/routing/url.ts → resolveIncomingPath).
   ===============================================================
   🛡️ ADMIN MIDDLEWARE — NATIVE AUTH (FAZ 4)
   ===============================================================
   Korunan path: /maki-admin/:path*

   native auth (createServerClient / auth.getUser / session refresh) ve
   marker-cookie (admin-session) TAMAMEN KALDIRILDI. Tek gerçek middleware:
     • Native access JWT (jose, edge-safe) doğrulanır.
     • Access geçerli → geçir. Access süresi dolmuş ama refresh cookie var
       → geçir (downstream /api/auth/refresh yeniler). İkisi de yoksa login.
   Gerçek yetki (is_active + admin) her istekte server-side
   `authorizeAdminCaller/Session` içinde native jose verify + admin_users
   lookup ile doğrulanır; middleware yalnızca redirect kapısıdır.
   =============================================================== */

const LOGIN_PATH = "/maki-admin/login";
const HOME_PATH = "/maki-admin";

async function adminGate(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;
  const isLoginPath = pathname === LOGIN_PATH;

  const access = req.cookies.get(ACCESS_COOKIE)?.value;
  const hasRefresh = !!req.cookies.get(REFRESH_COOKIE)?.value;

  let sessionOk = false;
  if (access) {
    const r = await verifyAccessToken(access);
    // access geçerli → OK; süresi dolmuş ama refresh var → yenilenebilir.
    sessionOk = r.ok || (!r.ok && r.reason === "expired" && hasRefresh);
  } else if (hasRefresh) {
    // access yok ama refresh var → downstream refresh eder.
    sessionOk = true;
  }

  // Login sayfasında ve oturum var → ana panele.
  if (isLoginPath && sessionOk) {
    const url = req.nextUrl.clone();
    url.pathname = HOME_PATH;
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Korunan path ve oturum yok → login'e.
  if (!isLoginPath && !sessionOk) {
    const url = req.nextUrl.clone();
    url.pathname = LOGIN_PATH;
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  /* Public 404 dil header'ı admin isteklerine taşınmaz (bilinmeyen
     admin yolu → TR minimal global 404). Oturum kapısı DEĞİŞMEDİ. */
  const headers = new Headers(req.headers);
  headers.delete(NOT_FOUND_LOCALE_HEADER);
  return NextResponse.next({ request: { headers } });
}

async function localeRouting(req: NextRequest): Promise<NextResponse> {
  const pathname = req.nextUrl.pathname;
  let decision = resolveIncomingPath(pathname, await getProxyRoutingContext());
  /* Yeni yayınlanan içerik cache yüzünden 404 görmesin: 404 kararından
     önce (en fazla 5 sn'de bir) bağlam tazelenip yeniden karar verilir. */
  if (decision.type === "notFound" && decision.reason === "noContent") {
    decision = resolveIncomingPath(pathname, await refreshProxyRoutingContext());
  }
  const url = req.nextUrl.clone();
  url.pathname = decision.path;
  if (decision.type === "redirect") {
    return NextResponse.redirect(url, decision.status);
  }
  /* İstemcinin gönderdiği 404 dil header'ı asla güvenilmez: her istekte
     silinir, yalnız proxy'nin 404 kararında yeniden yazılır. */
  const headers = new Headers(req.headers);
  headers.delete(NOT_FOUND_LOCALE_HEADER);
  if (decision.type === "notFound") {
    /* İç yol (/<dil>/__404__) hiçbir route'a uymaz → Next
       app/global-not-found.tsx'i GERÇEK SSR + HTTP 404 ile render eder. */
    headers.set(NOT_FOUND_LOCALE_HEADER, decision.locale);
  }
  return NextResponse.rewrite(url, { request: { headers } });
}

export async function proxy(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;
  if (pathname === "/maki-admin" || pathname.startsWith("/maki-admin/")) {
    return adminGate(req);
  }
  return localeRouting(req);
}

export const config = {
  matcher: [
    /* Admin oturum kapısı (DEĞİŞMEDİ). */
    "/maki-admin/:path*",
    /* Public sayfalar: API, Next iç dosyaları, admin ve uzantılı dosyalar
       (robots.txt, sitemap.xml, görseller, favicon…) HARİÇ her yol. */
    "/((?!api/|_next/|maki-admin|.*\\.[A-Za-z0-9]+$).*)",
  ],
};
