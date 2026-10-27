/* ===============================================================
   🛡️ ExternalReservationList — Pasifleştir / Aktifleştir butonları
   Aktif satır: "Pasifleştir". Elle pasifleştirilmiş satır:
   "Aktifleştir". Sync'in pasifleştirdiği (stale) satır: buton yok.
=============================================================== */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const base = {
  villa_id: "v1", source_id: "s1", start_date: "2027-01-02", end_date: "2027-01-05",
  summary: null, status: null, last_seen_at: "2026-10-06T10:00:00Z", created_at: "2026-10-06T10:00:00Z",
  source: { id: "s1", source_name: "Airbnb", is_active: true, last_success_at: null, last_error: null },
  villa: { id: "v1", title: "Villa Test", slug: "villa-test" },
};
const items = [
  { ...base, id: "a", external_uid: "a", is_active: true, manually_deactivated: false },
  { ...base, id: "m", external_uid: "m", is_active: false, manually_deactivated: true },
  { ...base, id: "s", external_uid: "s", is_active: false, manually_deactivated: false },
];
const listMock = vi.fn(async (f?: unknown) => (void f, { items, total: items.length }));
const activateMock = vi.fn(async (id: string) => ({ ok: true as const, id, alreadyActive: false }));
const deactivateMock = vi.fn(async (id: string) => ({ ok: true as const, id, alreadyInactive: false }));
const toast = { success: vi.fn(), error: vi.fn() };

vi.mock("@/app/(admin)/maki-admin/external-reservations/external-reservations.action", () => ({
  listExternalCalendarEventsAction: (f: unknown) => listMock(f),
  getExternalCalendarKpiAction: async () => ({ activeEventsCount: 1, activeSourcesCount: 1, errorSourcesCount: 0, lastSuccessAt: null }),
  getExternalCalendarFilterOptionsAction: async () => ({ villas: [], sources: [] }),
  countInactiveEventsForSourceAction: async () => 0,
}));
vi.mock("@/app/services/external-calendar-events.service", () => ({
  activateExternalCalendarEvent: (id: string) => activateMock(id),
  deactivateExternalCalendarEvent: (id: string) => deactivateMock(id),
  purgeInactiveEventsForSource: async () => ({ ok: true, deleted: 0 }),
}));
vi.mock("@/lib/admin-fetch", () => ({ adminFetch: vi.fn() }));
vi.mock("@/app/components/admin/notifications/NotificationProvider", () => ({ useNotify: () => toast }));
vi.mock("@/app/components/admin/shared/AdminDateRangePicker", () => ({ default: () => null }));

import ExternalReservationList from "@/app/(admin)/maki-admin/external-reservations/ExternalReservationList";

beforeEach(() => {
  cleanup();
  listMock.mockClear();
  activateMock.mockClear();
  deactivateMock.mockClear();
  toast.success.mockClear();
  toast.error.mockClear();
});

describe("satır aksiyonları", () => {
  it("aktif → Pasifleştir; elle pasif → Aktifleştir; stale pasif → buton yok", async () => {
    render(<ExternalReservationList />);
    await screen.findAllByText("Villa Test");
    expect(screen.getAllByRole("button", { name: "Bu event'i pasifleştir" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Bu event'i tekrar aktifleştir" })).toHaveLength(1);
  });

  it("Aktifleştir → activate(id) çağrılır, başarı toast'u, liste yenilenir", async () => {
    render(<ExternalReservationList />);
    await screen.findAllByText("Villa Test");
    const callsBefore = listMock.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Bu event'i tekrar aktifleştir" }));
    await waitFor(() => expect(activateMock).toHaveBeenCalledWith("m"));
    await waitFor(() => expect(listMock.mock.calls.length).toBeGreaterThan(callsBefore));
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining("aktifleştirildi"), expect.anything());
    expect(deactivateMock).not.toHaveBeenCalled();
  });

  it("Pasifleştir → deactivate(id) (mevcut davranış korunur)", async () => {
    render(<ExternalReservationList />);
    await screen.findAllByText("Villa Test");
    fireEvent.click(screen.getByRole("button", { name: "Bu event'i pasifleştir" }));
    await waitFor(() => expect(deactivateMock).toHaveBeenCalledWith("a"));
  });

  it("activate hatası → hata toast'u (API mesajı)", async () => {
    activateMock.mockResolvedValueOnce({ ok: false, error: "Kayıt durumu değişti" } as never);
    render(<ExternalReservationList />);
    await screen.findAllByText("Villa Test");
    fireEvent.click(screen.getByRole("button", { name: "Bu event'i tekrar aktifleştir" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Event aktifleştirilemedi", expect.objectContaining({ description: "Kayıt durumu değişti" }))
    );
  });
});
