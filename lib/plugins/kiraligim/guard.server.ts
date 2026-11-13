import "server-only";

/* ===============================================================
   Kiraligim kayıtları için admin koruması (YALNIZ sunucu)
   ===============================================================
   source_type = 'kiraligim' kaynakları ve etkinlikleri yalnız eklenti
   senkronu tarafından yazılır; iCal admin uçlarından (pasifleştir /
   aktifleştir / kalıcı temizle / kaynak düzenle-aç-kapa) DEĞİŞTİRİLEMEZ.
   Normal iCal kayıtlarının davranışı değişmez: bu yardımcılar yalnız
   kiraligim kayıtlarında true döner.
=============================================================== */
import { getPgPool } from "@/lib/db/pg.client";

export const KIRALIGIM_MANAGED_MESSAGE =
  "Bu kayıt Kiraligim'den gelir ve yalnız Kiraligim üzerinden değiştirilebilir.";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Q = { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> };
const pool = (): Q => getPgPool() as unknown as Q;

export async function isKiraligimSource(sourceId: string, db?: Q): Promise<boolean> {
  if (!UUID.test(sourceId)) return false;
  const r = await (db ?? pool()).query(
    `select 1 from public.external_calendar_sources where id = $1 and source_type = 'kiraligim'`,
    [sourceId],
  );
  return r.rows.length > 0;
}

export async function isKiraligimEvent(eventId: string, db?: Q): Promise<boolean> {
  if (!UUID.test(eventId)) return false;
  const r = await (db ?? pool()).query(
    `select 1 from public.external_calendar_events e
       join public.external_calendar_sources s on s.id = e.source_id
      where e.id = $1 and s.source_type = 'kiraligim'`,
    [eventId],
  );
  return r.rows.length > 0;
}
