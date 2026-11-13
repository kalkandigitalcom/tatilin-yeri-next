import { NextResponse } from "next/server";

import { authorizeCronRequest } from "@/lib/cron-auth";
import { defaultDb, pruneWebhookEvents } from "@/lib/plugins/kiraligim/store.server";
import { KiraligimNotConfigured, defaultDeps, runScheduledSync } from "@/lib/plugins/kiraligim/sync.server";

/* ===============================================================
   GET /api/cron/kiraligim-sync — Kiraligim değişiklik akışı (yedek yol)
   ===============================================================
   Coolify Scheduled Task (öneri: her 5 dakikada bir), Authorization: Bearer
   <CRON_SECRET>. Webhook kaçırılsa bile değişiklikler buradan alınır.
   Mevcut cron görevlerinden (iCal dahil) bağımsızdır. Kiraligim
   yapılandırılmamışsa 200 + skipped döner (görev hata vermez).
   Yanıt ve log yalnız sayılar/kodlar içerir.
=============================================================== */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = authorizeCronRequest(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  let deps;
  try {
    deps = defaultDeps();
  } catch (err) {
    if (err instanceof KiraligimNotConfigured) {
      return NextResponse.json({ ok: true, skipped: "not_configured" });
    }
    throw err;
  }
  const s = await runScheduledSync(deps);
  const pruned = await pruneWebhookEvents(defaultDb()).catch(() => 0);
  const body = {
    ok: s.errorCode === null,
    locked: s.locked,
    pages: s.pages,
    applied: s.applied,
    skipped: s.skipped,
    resnapshotted: s.resnapshotted,
    statusChecked: s.statusChecked,
    prunedWebhookEvents: pruned,
    error: s.errorCode,
  };
  console.info("[cron.kiraligim-sync]", body);
  return NextResponse.json(body, { status: s.errorCode ? 502 : 200 });
}
