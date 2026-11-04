import { NextResponse } from "next/server";

import { authorizeAdminCaller } from "@/lib/admin-route-auth";
import { callerHasPermission, FORBIDDEN_MESSAGE } from "@/lib/auth/action-authz";
import { settingsServerRepository } from "@/lib/db/settings.repository.server";
import { siteLocaleRepository } from "@/lib/db/site-locale.repository.server";
import {
  extractAdminContextFromRequest,
  insertAdminActivityLog,
} from "@/app/services/admin-activity-log.service";
import {
  getEnabledPublicLocales,
  isMultilingualEnabled,
  toLocale,
  type Locale,
} from "@/lib/i18n/config";
import {
  planRootLocaleChange,
  validateRootLocaleChange,
  type RootLocaleChangeState,
} from "@/lib/i18n/root-locale-change";
import { invalidatePublicRoutingCaches } from "@/lib/i18n/routing/invalidate.server";
import { getCachedLocalizedSlugMap } from "@/lib/i18n/routing/slug-map.server";

/* ===============================================================
   🌐 /api/admin/settings/root-locale — ANA DİL DEĞİŞİMİ (Faz 4)
   ===============================================================
   GET  ?to=en  → önizleme: mevcut/hedef ana dil, doğrulama sonucu ve
                  URL etki tablosu (yazma YOK).
   POST { expected, to, confirm: true } → değişimi uygular:
     1) Yetki: `settings` izni (genel ayarlar ile aynı).
     2) Doğrulama: validateRootLocaleChange (client ile AYNI saf kural)
        + DB fonksiyonu change_public_root_locale (migration 104):
        settings FOR UPDATE kilidi, iyimser `expected` kontrolü, hedef
        dil aktif (FOR SHARE) → atomik; eş zamanlı ikinci istek 409.
     3) Başarılıysa: proxy + data cache + ISR geçersiz kılınır
        (invalidatePublicRoutingCaches) ve admin_activity_logs'a
        `settings.root_locale_change` yazılır.
     Hata → DB'de hiçbir şey değişmez (tek fonksiyon = tek işlem);
     eski ana dil korunur.
   Genel ayarlar PUT'u (`/api/admin/settings`) ana dili DEĞİŞTİREMEZ
   (409) — tek yazma yolu burasıdır.
   =============================================================== */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIGRATION_MISSING =
  "Ana dil değişimi için veritabanı güncellemesi (migration 104) uygulanmamış.";

type DbState = RootLocaleChangeState & { ok: true };

async function readState(): Promise<DbState | { ok: false; error: string }> {
  const [{ data: settings, error: sErr }, { data: rows, error: lErr }] = await Promise.all([
    settingsServerRepository.findSingleton(),
    siteLocaleRepository.findAll(),
  ]);
  if (sErr || !settings) return { ok: false, error: "Ayarlar okunamadı" };
  const s = settings as { public_default_locale?: string | null; multilingual_enabled?: boolean | null };
  const multilingualEnabled = isMultilingualEnabled(s);
  const current = toLocale(s.public_default_locale);
  const enabled = getEnabledPublicLocales({
    multilingual_enabled: true,
    public_default_locale: current,
    public_locales: lErr ? null : (rows ?? null),
  });
  return { ok: true, current, enabled, multilingualEnabled };
}

async function buildPlan(state: RootLocaleChangeState, to: Locale) {
  const slugs = await getCachedLocalizedSlugMap().catch(() => ({}));
  return planRootLocaleChange({ root: state.current, enabled: state.enabled, slugs: slugs ?? {} }, to);
}

export async function GET(req: Request): Promise<NextResponse> {
  try {
    const auth = await authorizeAdminCaller(req);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }
    if (!(await callerHasPermission(auth.caller.id, "settings"))) {
      return NextResponse.json({ ok: false, error: FORBIDDEN_MESSAGE }, { status: 403 });
    }
    const state = await readState();
    if (!state.ok) return NextResponse.json({ ok: false, error: state.error }, { status: 500 });

    const to = new URL(req.url).searchParams.get("to");
    const base = {
      ok: true,
      current: state.current,
      enabled: state.enabled,
      multilingualEnabled: state.multilingualEnabled,
    };
    if (!to) return NextResponse.json(base);

    const v = validateRootLocaleChange({ to }, state);
    if (!v.ok) {
      return NextResponse.json({ ...base, valid: false, error: v.error, code: v.code });
    }
    return NextResponse.json({ ...base, valid: true, plan: await buildPlan(state, v.to) });
  } catch (err) {
    console.error("[admin.settings.root-locale.preview] EXCEPTION", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "Önizleme hazırlanamadı" }, { status: 500 });
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const auth = await authorizeAdminCaller(req);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }
    if (!(await callerHasPermission(auth.caller.id, "settings"))) {
      return NextResponse.json({ ok: false, error: FORBIDDEN_MESSAGE }, { status: 403 });
    }

    let body: { to?: unknown; expected?: unknown; confirm?: unknown } | null = null;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Geçersiz istek" }, { status: 400 });
    }
    if (body?.confirm !== true) {
      return NextResponse.json(
        { ok: false, error: "Ana dil değişimi için önizleme onayı gerekli." },
        { status: 400 }
      );
    }
    if (body.expected === undefined) {
      return NextResponse.json({ ok: false, error: "Mevcut ana dil bilgisi eksik." }, { status: 400 });
    }

    const state = await readState();
    if (!state.ok) return NextResponse.json({ ok: false, error: state.error }, { status: 500 });

    const v = validateRootLocaleChange({ to: body.to, expected: body.expected }, state);
    if (!v.ok) {
      return NextResponse.json(
        { ok: false, error: v.error, code: v.code, current: state.current },
        { status: v.code === "conflict" ? 409 : 400 }
      );
    }

    const plan = await buildPlan(state, v.to);
    if (plan.issues.length) {
      console.error("[admin.settings.root-locale] PLAN ISSUES", plan.issues);
      return NextResponse.json(
        { ok: false, error: "URL geçiş planı doğrulanamadı; değişiklik yapılmadı.", issues: plan.issues },
        { status: 500 }
      );
    }

    const { error } = await siteLocaleRepository.changeRootLocale(v.from, v.to);
    if (error) {
      const msg = error.message || "";
      if (/change_public_root_locale/.test(msg) && /does not exist/i.test(msg)) {
        return NextResponse.json(
          { ok: false, error: MIGRATION_MISSING, migrationMissing: true },
          { status: 503 }
        );
      }
      if (/root_locale_conflict/.test(msg)) {
        const fresh = await readState();
        return NextResponse.json(
          {
            ok: false,
            code: "conflict",
            error: "Ana dil bu sırada başka bir oturumda değiştirildi. Sayfayı yenileyip tekrar deneyin.",
            current: fresh.ok ? fresh.current : undefined,
          },
          { status: 409 }
        );
      }
      console.error("[admin.settings.root-locale] FAILED", msg);
      return NextResponse.json(
        { ok: false, error: "Ana dil değiştirilemedi; mevcut ana dil korundu." },
        { status: 400 }
      );
    }

    /* Kayıt DB'de → proxy ve sunucu aynı anda yeni ana dile geçer. */
    invalidatePublicRoutingCaches();

    await insertAdminActivityLog(extractAdminContextFromRequest(req, auth.caller), {
      action: "settings.root_locale_change",
      entity_type: "settings",
      entity_title: `Ana dil: ${v.from} → ${v.to}`,
      before_data: { public_default_locale: v.from },
      after_data: {
        public_default_locale: v.to,
        redirected_urls: plan.summary.redirected,
        reassigned_urls: plan.summary.reassigned,
        redirect_status: plan.summary.redirectStatus,
      },
    });

    return NextResponse.json({ ok: true, previous: v.from, current: v.to, plan });
  } catch (err) {
    console.error("[admin.settings.root-locale] EXCEPTION", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { ok: false, error: "Ana dil değiştirilemedi; mevcut ana dil korundu." },
      { status: 500 }
    );
  }
}
