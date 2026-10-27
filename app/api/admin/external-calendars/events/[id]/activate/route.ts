import { NextResponse } from "next/server";

import { authorizeAdminCaller } from "@/lib/admin-route-auth";
import {
  callerHasPermission,
  FORBIDDEN_MESSAGE,
} from "@/lib/auth/action-authz";
import { externalCalendarEventServerRepository } from "@/lib/db/external-calendar-event.repository.server";
import { externalCalendarSourceServerRepository } from "@/lib/db/external-calendar-source.repository.server";
import { villaAdminRepository } from "@/lib/db/villa.repository.server";
import { getExternalCalendarToday } from "@/lib/external-calendar-past";
import {
  extractAdminContextFromRequest,
  insertAdminActivityLog,
} from "@/app/services/admin-activity-log.service";

/* ===============================================================
   🛡️ ADMIN EXTERNAL EVENT ACTIVATE — deactivate'ın tersi
   ===============================================================
   POST /api/admin/external-calendars/events/[id]/activate
   AUTH: authorizeAdminCaller + external_calendars izni (deactivate ile aynı)

   SORUN (BEFORE): Pasifleştirme `manually_deactivated=true` yazıyor;
   bu bayrağı temizleyen hiçbir yol yoktu. Sync upsert'i is_active'i
   true yapsa bile manual-override sweep (migration 032) satırı tekrar
   pasife düşürüyordu → admin'in pasifleştirdiği kayıt kalıcı pasif.

   FLOW:
     1) Admin + izin doğrula
     2) Event'i oku (manually_deactivated dahil)
     3) Kurallar:
        • zaten aktif           → 200, already_active:true (idempotent)
        • geçmiş (end < bugün)  → 409 (listede gizli, sync siler)
        • manuel pasif DEĞİL    → 409 (feed'den düştüğü için sync
          pasifleştirdi; açılsa bir sonraki sync yine kapatır)
     4) UPDATE is_active=true, manually_deactivated=false
        (WHERE manually_deactivated=true — yarış güvenli)
     5) Activity log + JSON

   SONRAKİ SYNC: bayrak temizlendiği için event feed'de duruyorsa aktif
   kalır; feed'den düşmüşse normal stale-deactivate akışı uygulanır.
   ⚠️ HARD DELETE YOK; reservation / EXCLUDE / trigger'lara dokunulmaz.
=============================================================== */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await authorizeAdminCaller(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }
  if (!(await callerHasPermission(auth.caller.id, "external_calendars"))) {
    return NextResponse.json(
      { ok: false, error: FORBIDDEN_MESSAGE },
      { status: 403 }
    );
  }

  const { id } = await context.params;
  const eventId = (id || "").toString().trim();
  if (!eventId) {
    return NextResponse.json(
      { ok: false, error: "event id gerekli" },
      { status: 400 }
    );
  }

  const { data: existing, error: fetchErr } =
    await externalCalendarEventServerRepository.findByIdForActivate(eventId);
  if (fetchErr) {
    console.error(
      "[admin.external_events.activate] FETCH FAILED",
      fetchErr.message
    );
    return NextResponse.json(
      { ok: false, error: `Event okunamadı: ${fetchErr.message}` },
      { status: 500 }
    );
  }
  if (!existing) {
    return NextResponse.json(
      { ok: false, error: "Event bulunamadı" },
      { status: 404 }
    );
  }

  type EventRow = {
    id: string;
    villa_id: string;
    source_id: string;
    start_date: string;
    end_date: string;
    is_active: boolean;
    manually_deactivated: boolean | null;
  };
  const row = (existing as unknown) as EventRow;

  if (row.is_active) {
    return NextResponse.json({ ok: true, id: row.id, already_active: true });
  }
  if (row.end_date < getExternalCalendarToday()) {
    return NextResponse.json(
      { ok: false, error: "Geçmiş tarihli kayıt aktifleştirilemez" },
      { status: 409 }
    );
  }
  if (row.manually_deactivated !== true) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Bu kayıt kaynak takviminde artık yer almadığı için senkronizasyon tarafından pasifleştirildi; elle aktifleştirilemez. Kaynak takvimde tekrar görünürse sync onu otomatik açar.",
      },
      { status: 409 }
    );
  }

  const now = new Date().toISOString();
  const { data: updated, error: updateErr } =
    await externalCalendarEventServerRepository.reactivateManualById(
      eventId,
      now
    );
  if (updateErr) {
    console.error(
      "[admin.external_events.activate] UPDATE FAILED",
      updateErr.message
    );
    return NextResponse.json(
      { ok: false, error: `Event aktifleştirilemedi: ${updateErr.message}` },
      { status: 500 }
    );
  }
  if (!Array.isArray(updated) || updated.length === 0) {
    /* Okuma ile UPDATE arasında durum değişti (ör. eşzamanlı sync/admin). */
    return NextResponse.json(
      { ok: false, error: "Kayıt durumu değişti; listeyi yenileyip tekrar deneyin" },
      { status: 409 }
    );
  }

  /* Activity log entity_title — fail-soft (deactivate ile aynı). */
  let sourceName = "Harici";
  let villaTitle = row.villa_id;
  try {
    const { data: srcData } =
      await externalCalendarSourceServerRepository.findSourceNameById(
        row.source_id
      );
    const n = (srcData as { source_name?: string | null } | null)?.source_name;
    if (typeof n === "string" && n.trim()) sourceName = n.trim();
    const { data: vData } = await villaAdminRepository.findTitleById(
      row.villa_id
    );
    const t = (vData as { title?: string | null } | null)?.title;
    if (typeof t === "string" && t.trim()) villaTitle = t.trim();
  } catch {
    /* enriched lookup hatası audit'i bozmaz. */
  }

  try {
    const ctx = extractAdminContextFromRequest(req, auth.caller);
    await insertAdminActivityLog(ctx, {
      action: "external_calendar_event.activated",
      entity_type: "external_calendar",
      entity_id: row.id,
      entity_title: `${sourceName} · ${villaTitle} · ${row.start_date} → ${row.end_date}`,
      before_data: { is_active: false, manually_deactivated: true },
      after_data: { is_active: true, manually_deactivated: false },
      diff_summary: [
        "is_active: false → true",
        "manually_deactivated: true → false",
      ],
    });
  } catch (logErr) {
    console.warn(
      "[admin.external_events.activate] activity log WARN",
      logErr instanceof Error ? logErr.message : "unknown"
    );
  }

  return NextResponse.json({ ok: true, id: row.id, already_active: false });
}
