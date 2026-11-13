import "server-only";

import { externalCalendarSourceServerRepository } from "@/lib/db/external-calendar-source.repository.server";
import { externalCalendarEventServerRepository } from "@/lib/db/external-calendar-event.repository.server";
import { parseICS, type ParsedEvent } from "@/lib/ical.parser";
import { validateExternalUrl } from "@/lib/security/ssrf.server";
import {
  getExternalCalendarToday,
  isPastExternalEvent,
} from "@/lib/external-calendar-past";

/* ===============================================================
   🛡️ FAZ 56B — EXTERNAL CALENDAR SYNC SERVICE
   ===============================================================
   external_calendar_sources içindeki bir kayıt için iCal feed'i
   indirir, parser'a verir, sonucu external_calendar_events tablosuna
   transaction-safe upsert eder.

   ⚠️ KRİTİK GÜVENLİK:
     • External event'ler `reservations` tablosuna ASLA insert edilmez.
     • Mail / payment / status lifecycle TETİKLENMEZ.
     • `availability.helper.ts` BU FAZDA dokunulmaz (FAZ 56C iş'i).
     • Sync sonrası availability/calendar/booking sidebar davranışı
       BYTE-IDENTICAL — public kullanıcı hiçbir fark görmez.

   ÖZELLİKLER:
     • 10s fetch timeout (AbortController) — process hang etmez
     • HTTP non-2xx → graceful fail, last_error yazılır
     • Parser hatası → graceful fail
     • UPSERT (villa_id, external_uid) — duplicate protection
     • Soft delete: bu sync'te görülmeyen önceki event'ler is_active=false
     • Hard delete YOK (audit korunur) — TEK İSTİSNA: bugünden önce
       bitmiş (end_date < bugün, Europe/Istanbul) event'ler. Bunlar
       upsert'e HİÇ girmez (imported/last_seen_at etkilenmez) ve
       kaynağın DB'deki geçmiş satırları sync sırasında silinir
       (lib/external-calendar-past.ts).
     • Service-role only; admin client'tan direct çağrılamaz
       (RLS INSERT/UPDATE policy yok bu tablo için)
=============================================================== */

const FETCH_TIMEOUT_MS = 10_000;
const USER_AGENT = "Mozilla/5.0 villakiralama-ical-sync/1.0";
const MAX_REDIRECTS = 5;

export type SyncSourceResult =
  | {
      ok: true;
      sourceId: string;
      sourceName: string;
      villaId: string;
      imported: number;     // upsert edilen (yeni + güncellenen) — geçmiş HARİÇ
      deactivated: number;  // bu sync'te yok → is_active=false
      skipped: number;      // parser skip (local-marker, invalid)
      totalSeen: number;    // ham VEVENT sayısı
      skippedPast: number;  // feed'de olup bugünden önce bitmiş → import edilmedi
      deletedPast: number;  // kaynağın DB'deki geçmiş satırları → silindi
    }
  | {
      ok: false;
      sourceId: string;
      sourceName: string;
      villaId: string;
      error: string;
      stage: "fetch" | "parse" | "upsert" | "deactivate" | "unknown";
    };

type SourceRow = {
  id: string;
  villa_id: string;
  source_name: string;
  /** Kiraligim eklentisi kaynakları ('kiraligim') iCal değildir. */
  source_type?: string | null;
  ical_url: string;
  is_active: boolean | null;
};

/* ---------- TIMEOUT-SAFE + SSRF-HARDENED FETCH ----------
   SSRF DENYLIST GUARD (lib/security/ssrf):
     • Pre-fetch: validateExternalUrl(url) — string + DNS resolve;
       private/loopback/link-local hedef ise reject.
     • Redirect: native `redirect:"follow"` her hop'u GİZLİYORDU →
       30x Location header private IP'ye dönerse fetch sessizce
       bağlanırdı. Şimdi `redirect:"manual"` + döngü; her hop için
       yeniden validate.
     • Timeout/AbortController + 10s deadline KORUNUYOR (toplam
       budget redirect zinciri boyunca aynı). */
async function fetchIcsBody(initialUrl: string): Promise<
  { ok: true; body: string } | { ok: false; error: string }
> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    let currentUrl = initialUrl;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const validation = await validateExternalUrl(currentUrl);
      if (!validation.ok) {
        return { ok: false, error: validation.error };
      }

      const res = await fetch(validation.url.toString(), {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/calendar, text/plain;q=0.9, */*;q=0.5",
        },
        cache: "no-store",
        signal: ctrl.signal,
        redirect: "manual",
      });

      /* Manual redirect handling — 30x görürse Location'ı al, yeniden
         validate edip döngüye devam et. */
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) {
          return {
            ok: false,
            error: `HTTP ${res.status} yönlendirme Location yok`,
          };
        }
        if (hop >= MAX_REDIRECTS) {
          return {
            ok: false,
            error: `Çok fazla yönlendirme (>${MAX_REDIRECTS})`,
          };
        }
        try {
          currentUrl = new URL(loc, validation.url).toString();
        } catch {
          return { ok: false, error: "Yönlendirme adresi geçersiz" };
        }
        continue;
      }

      if (!res.ok) {
        return {
          ok: false,
          error: `HTTP ${res.status} ${res.statusText || ""}`.trim(),
        };
      }
      const body = await res.text();
      if (!body || body.length < 16) {
        return { ok: false, error: "Boş veya geçersiz iCal yanıtı" };
      }
      return { ok: true, body };
    }
    return {
      ok: false,
      error: `Çok fazla yönlendirme (>${MAX_REDIRECTS})`,
    };
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.name === "AbortError"
          ? `Zaman aşımı (${FETCH_TIMEOUT_MS / 1000}s)`
          : err.message
        : "Bilinmeyen ağ hatası";
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- SOURCE META UPDATER ---------- */
async function markSourceMetadata(
  sourceId: string,
  patch: {
    last_synced_at: string;
    last_success_at?: string | null;
    last_error?: string | null;
    last_event_count?: number | null;
  }
): Promise<void> {
  const { error } = await externalCalendarSourceServerRepository.updateById(
    sourceId,
    { ...patch, updated_at: new Date().toISOString() }
  );
  if (error) {
    console.warn(
      "[external-calendar.sync] source metadata update FAILED",
      { sourceId, error: error.message }
    );
  }
}

/* ---------- MAIN ENTRY ----------
   syncExternalCalendarSource(sourceId) → SyncSourceResult
   Asla throw etmez; hata durumunda { ok:false, error, stage } döner. */
export async function syncExternalCalendarSource(
  sourceId: string
): Promise<SyncSourceResult> {
  const now = new Date().toISOString();

  /* 1) Source row fetch */
  const { data: srcData, error: srcErr } =
    await externalCalendarSourceServerRepository.findForSync(sourceId);
  if (srcErr || !srcData) {
    return {
      ok: false,
      sourceId,
      sourceName: "",
      villaId: "",
      error: srcErr?.message || "Kaynak bulunamadı",
      stage: "fetch",
    };
  }
  const source = srcData as SourceRow;
  /* Kiraligim eklentisinin kaynağı iCal adresinden ÇEKİLMEZ (veri
     imzalı Kiraligim API'sinden eklenti senkronuyla gelir). Cron zaten
     bu kaynakları listelemez; bu guard manuel tetiklemeyi de kapatır.
     Kaynak satırına ve etkinliklerine hiçbir yazım yapılmaz. */
  if (source.source_type === "kiraligim") {
    return {
      ok: false,
      sourceId: source.id,
      sourceName: source.source_name,
      villaId: source.villa_id,
      error: "Kiraligim kaynağı iCal ile senkronize edilmez",
      stage: "fetch",
    };
  }
  if (source.is_active === false) {
    return {
      ok: false,
      sourceId: source.id,
      sourceName: source.source_name,
      villaId: source.villa_id,
      error: "Kaynak pasif (is_active=false)",
      stage: "fetch",
    };
  }

  /* 2) Feed fetch */
  const fetchRes = await fetchIcsBody(source.ical_url);
  if (!fetchRes.ok) {
    await markSourceMetadata(source.id, {
      last_synced_at: now,
      last_error: fetchRes.error,
    });
    return {
      ok: false,
      sourceId: source.id,
      sourceName: source.source_name,
      villaId: source.villa_id,
      error: fetchRes.error,
      stage: "fetch",
    };
  }

  /* 3) Parse */
  let parsed: ReturnType<typeof parseICS>;
  try {
    parsed = parseICS(fetchRes.body);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "parse exception";
    await markSourceMetadata(source.id, {
      last_synced_at: now,
      last_error: `parse: ${msg}`,
    });
    return {
      ok: false,
      sourceId: source.id,
      sourceName: source.source_name,
      villaId: source.villa_id,
      error: msg,
      stage: "parse",
    };
  }

  /* 3b) GEÇMİŞ FİLTRESİ — bugünden önce bitmiş (end_date < bugün,
        Europe/Istanbul; end_date exclusive) event'ler DB'ye YAZILMAZ:
        upsert'e girmez, imported'a sayılmaz, last_seen_at'leri
        güncellenmez. Parser'a DOKUNULMADI. */
  const today = getExternalCalendarToday(new Date(now));
  const currentEvents = parsed.events.filter(
    (e) => !isPastExternalEvent(e.end_date, today)
  );
  const skippedPast = parsed.events.length - currentEvents.length;

  /* 4) UPSERT rows */
  const upsertRows = buildUpsertRows(source, currentEvents, now);
  let imported = 0;
  if (upsertRows.length > 0) {
    const { data, error } =
      await externalCalendarEventServerRepository.upsertByVillaUid(
        upsertRows
      );
    if (error) {
      await markSourceMetadata(source.id, {
        last_synced_at: now,
        last_error: `upsert: ${error.message}`,
      });
      return {
        ok: false,
        sourceId: source.id,
        sourceName: source.source_name,
        villaId: source.villa_id,
        error: error.message,
        stage: "upsert",
      };
    }
    imported = Array.isArray(data) ? data.length : upsertRows.length;
  }

  /* 4b) MANUAL OVERRIDE SWEEP — admin'in pasifleştirdiği event'leri
        sync'in geri diriltememesi için (FAZ 56G+). Migration 032
        manually_deactivated boolean kolonunu eklemiştir. Upsert
        is_active'i `true` set ediyor (re-appearing event reactivation
        davranışı korunur); bu sweep yalnızca manuel-pasifleştirilen
        satırları is_active=false'a tekrar düşürür. Sweep idempotent
        ve fail-soft — hata olursa sync'in tamamı bozulmaz. */
  try {
    const { error: overrideErr } =
      await externalCalendarEventServerRepository.deactivateManualOverrideBySource(
        source.id,
        now
      );
    if (overrideErr) {
      console.warn(
        "[external-calendar.sync] manual_override sweep WARN",
        { sourceId: source.id, error: overrideErr.message }
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.warn(
      "[external-calendar.sync] manual_override sweep EXCEPTION",
      { sourceId: source.id, error: msg }
    );
  }

  /* 4c) GEÇMİŞ CLEANUP — bu kaynağın DB'deki `end_date < bugün`
        satırları HARD DELETE. Kriter YALNIZ bu; bugünle kesişen /
        gelecek satırlara (manuel-pasif dahil) dokunmaz. Stale adımından
        ÖNCE çalışır → geçmiş satırlar "deactivated" sayısına karışmaz.
        Fail-soft: hata sync'i bozmaz, bir sonraki sync yine dener. */
  let deletedPast = 0;
  try {
    const { data: pastData, error: pastErr } =
      await externalCalendarEventServerRepository.deletePastBySource(
        source.id,
        today
      );
    if (pastErr) {
      console.warn(
        "[external-calendar.sync] past cleanup WARN",
        { sourceId: source.id, error: pastErr.message }
      );
    } else {
      deletedPast = Array.isArray(pastData) ? pastData.length : 0;
    }
  } catch (err) {
    console.warn(
      "[external-calendar.sync] past cleanup EXCEPTION",
      {
        sourceId: source.id,
        error: err instanceof Error ? err.message : "unknown",
      }
    );
  }

  /* 5) Soft deactivate — bu sync'te yok olan eski event'ler.
        "Görülen" = DB'ye yazılan (geçmiş olmayan) event'ler. */
  let deactivated = 0;
  try {
    const seenUids = currentEvents.map((e) => e.uid);
    /* Mevcut kaynağın stale event'leri:
         source_id = source.id AND is_active = true
         AND external_uid NOT IN (seenUids)
       seenUids boş ise: tüm aktif satırları deaktive et. */
    const { data: deactData, error: deactErr } =
      await externalCalendarEventServerRepository.deactivateStaleBySource(
        source.id,
        now,
        seenUids
      );
    if (deactErr) {
      /* Deactivate fail = stale event'ler aktif kalır; bir sonraki
         sync yine dener. Hata source metadata'sına yazılır ama
         imported değeri korunur (ana operation success). */
      await markSourceMetadata(source.id, {
        last_synced_at: now,
        last_success_at: now,
        last_error: `deactivate: ${deactErr.message}`,
        last_event_count: currentEvents.length,
      });
      return {
        ok: false,
        sourceId: source.id,
        sourceName: source.source_name,
        villaId: source.villa_id,
        error: deactErr.message,
        stage: "deactivate",
      };
    }
    deactivated = Array.isArray(deactData) ? deactData.length : 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "deactivate exception";
    await markSourceMetadata(source.id, {
      last_synced_at: now,
      last_success_at: now,
      last_error: `deactivate: ${msg}`,
      last_event_count: currentEvents.length,
    });
    return {
      ok: false,
      sourceId: source.id,
      sourceName: source.source_name,
      villaId: source.villa_id,
      error: msg,
      stage: "deactivate",
    };
  }

  /* 6) Success metadata */
  await markSourceMetadata(source.id, {
    last_synced_at: now,
    last_success_at: now,
    last_error: null,
    last_event_count: currentEvents.length,
  });

  return {
    ok: true,
    sourceId: source.id,
    sourceName: source.source_name,
    villaId: source.villa_id,
    imported,
    deactivated,
    skipped: parsed.skipped,
    totalSeen: parsed.totalSeen,
    skippedPast,
    deletedPast,
  };
}

/* ---------- HELPER: UPSERT ROW BUILDER ---------- */
function buildUpsertRows(
  source: SourceRow,
  events: ParsedEvent[],
  now: string
): Array<{
  source_id: string;
  villa_id: string;
  external_uid: string;
  start_date: string;
  end_date: string;
  summary: string | null;
  description: string | null;
  status: string | null;
  raw_ical: string;
  is_active: boolean;
  last_seen_at: string;
  updated_at: string;
}> {
  return events.map((e) => ({
    source_id: source.id,
    villa_id: source.villa_id,
    external_uid: e.uid,
    start_date: e.start_date,
    end_date: e.end_date,
    summary: e.summary,
    description: e.description,
    status: e.status,
    raw_ical: e.raw_ical,
    is_active: true,
    last_seen_at: now,
    updated_at: now,
  }));
}
