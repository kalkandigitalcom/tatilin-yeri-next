import { NextResponse } from "next/server";

import { authorizeAdminCaller } from "@/lib/admin-route-auth";
import {
  callerHasPermission,
  FORBIDDEN_MESSAGE,
} from "@/lib/auth/action-authz";
import { settingsServerRepository } from "@/lib/db/settings.repository.server";
import { siteLocaleRepository } from "@/lib/db/site-locale.repository.server";
import { validateEnabledLocalesInput } from "@/lib/i18n/site-locales.validation";
import { toLocale } from "@/lib/i18n/config";
import { invalidatePublicRoutingCaches } from "@/lib/i18n/routing/invalidate.server";

/* ===============================================================
   🌐 /api/admin/settings/locales — dil bazlı açma/kapama (Faz 1)
   ===============================================================
   GET → site_locales satırları + ana dil (settings.public_default_locale)
   PUT → { enabled: string[] } aktif dil listesini atomik yazar
         (`set_site_locales_enabled` RPC, migration 101).

   Yetki: `settings` izni (ana ayarlar PUT'u ile aynı).
   Doğrulama SIRASI: (1) uygulama kuralları (validateEnabledLocalesInput)
   → (2) DB trigger'ı (ana dil kapatılamaz) — çift kilit.
   Mevcut `/api/admin/settings` PUT akışı bu route'tan ETKİLENMEZ.
   =============================================================== */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIGRATION_MISSING =
  "Dil yönetimi tablosu bulunamadı (migration 101 uygulanmamış).";

function isMissingRelation(message: string | undefined): boolean {
  return !!message && /site_locales|set_site_locales_enabled/.test(message) &&
    /does not exist|bulunamadı|undefined/i.test(message);
}

async function readState() {
  const [{ data: settings }, { data: rows, error }] = await Promise.all([
    settingsServerRepository.findSingleton(),
    siteLocaleRepository.findAll(),
  ]);
  const rootLocale = toLocale(
    (settings as { public_default_locale?: string | null } | null)
      ?.public_default_locale
  );
  return { rootLocale, rows: rows ?? [], error };
}

export async function GET(req: Request): Promise<NextResponse> {
  try {
    const auth = await authorizeAdminCaller(req);
    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, error: auth.error },
        { status: auth.status }
      );
    }
    if (!(await callerHasPermission(auth.caller.id, "settings"))) {
      return NextResponse.json(
        { ok: false, error: FORBIDDEN_MESSAGE },
        { status: 403 }
      );
    }

    const { rootLocale, rows, error } = await readState();
    if (error) {
      const missing = isMissingRelation(error.message);
      console.error("[admin.settings.locales.read] FAILED", error.message);
      return NextResponse.json(
        {
          ok: false,
          error: missing ? MIGRATION_MISSING : "Dil ayarları alınamadı",
          migrationMissing: missing,
        },
        { status: missing ? 503 : 500 }
      );
    }
    return NextResponse.json({ ok: true, rootLocale, locales: rows });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Bilinmeyen hata";
    console.error("[admin.settings.locales.read] EXCEPTION", msg);
    return NextResponse.json(
      { ok: false, error: "Dil ayarları alınamadı" },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request): Promise<NextResponse> {
  try {
    const auth = await authorizeAdminCaller(req);
    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, error: auth.error },
        { status: auth.status }
      );
    }
    if (!(await callerHasPermission(auth.caller.id, "settings"))) {
      return NextResponse.json(
        { ok: false, error: FORBIDDEN_MESSAGE },
        { status: 403 }
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: "Geçersiz istek" },
        { status: 400 }
      );
    }

    const { rootLocale, error: readErr } = await readState();
    if (readErr) {
      const missing = isMissingRelation(readErr.message);
      return NextResponse.json(
        {
          ok: false,
          error: missing ? MIGRATION_MISSING : "Dil ayarları alınamadı",
          migrationMissing: missing,
        },
        { status: missing ? 503 : 500 }
      );
    }

    const result = validateEnabledLocalesInput(
      (body as { enabled?: unknown } | null)?.enabled,
      rootLocale
    );
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: 400 }
      );
    }

    const { error } = await siteLocaleRepository.setEnabled(result.enabled);
    if (error) {
      const missing = isMissingRelation(error.message);
      console.error("[admin.settings.locales.update] FAILED", error.message);
      return NextResponse.json(
        {
          ok: false,
          error: missing ? MIGRATION_MISSING : "Dil ayarları kaydedilemedi",
          migrationMissing: missing,
        },
        { status: missing ? 503 : 500 }
      );
    }

    /* Faz 4 — dil aç/kapa proxy dahil hemen yansır (30 sn TTL beklenmez). */
    invalidatePublicRoutingCaches();

    const { rows } = await readState();
    return NextResponse.json({ ok: true, rootLocale, locales: rows });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Bilinmeyen hata";
    console.error("[admin.settings.locales.update] EXCEPTION", msg);
    return NextResponse.json(
      { ok: false, error: "Dil ayarları kaydedilemedi" },
      { status: 500 }
    );
  }
}
