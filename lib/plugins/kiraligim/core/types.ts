/* Kiraligim Acente API'si v1 — bu eklentinin kullandığı alanlar.
   Sözleşme: kiraligim-next/docs/api/openapi.yaml. Tarih aralıkları
   yarı açıktır: [start_date, end_date) — end_date çıkış günüdür, dolu
   DEĞİLDİR (bu projenin external_calendar_events semantiğiyle aynı). */

export type BusyRange = { start_date: string; end_date: string };

export type KiraligimMe = {
  id: string;
  name: string;
  rate_limit: { limit: number; window_seconds: number };
};

export type KiraligimProperty = { id: string; name: string };

export type KiraligimConnectionStatus = "active" | "paused" | "disconnected" | "revoked";

export type KiraligimConnection = {
  id: string;
  property_id: string;
  external_property_id: string;
  status: KiraligimConnectionStatus;
  created_at: string;
  ended_at: string | null;
  last_synced_at: string | null;
};

export type KiraligimSnapshot = {
  connection_id: string;
  property_id: string;
  external_property_id: string;
  from: string;
  to: string;
  busy_dates: BusyRange[];
  cursor: string;
};

export type KiraligimChange = {
  change_id: string;
  start_date: string;
  end_date: string;
  busy_dates: BusyRange[];
};

export type KiraligimAccountChange = KiraligimChange & {
  connection_id: string;
  property_id: string;
  external_property_id: string;
};

export type KiraligimAccountChanges = {
  changes: KiraligimAccountChange[];
  next_cursor: string;
  has_more: boolean;
};

export type KiraligimWebhook = {
  url: string;
  created_at: string;
  updated_at: string;
  secret_rotated_at: string | null;
  /** Yalnız oluşturma (201) ve sır yenileme yanıtında. */
  secret?: string;
};
