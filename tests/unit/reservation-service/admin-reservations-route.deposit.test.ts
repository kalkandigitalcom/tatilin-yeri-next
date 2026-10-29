// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

/* ===============================================================
   🛡️ Migration 099 — /api/admin/reservations POST depozito snapshot'ı
   ===============================================================
   - Client'ın gönderdiği damage_deposit alanları villanın kendi
     kaydından üretilen değerlerle EZİLİR.
   - Kur yoksa rezervasyon OLUŞTURULMAZ (400).
   - Toplam / ödeme alanları DEĞİŞMEZ.
   =============================================================== */

const createReservation = vi.fn();
const resolveAuthoritativeDamageDeposit = vi.fn();

vi.mock("@/lib/admin-route-auth", () => ({
  authorizeAdminCaller: async () => ({ ok: true, caller: { id: "admin-1" } }),
}));
vi.mock("@/lib/auth/action-authz", () => ({
  callerHasPermission: async () => true,
  FORBIDDEN_MESSAGE: "forbidden",
}));
vi.mock("@/app/services/reservation.service", () => ({
  createReservation: (...a: unknown[]) => createReservation(...a),
  updateReservationStatus: vi.fn(),
}));
vi.mock("@/lib/db/reservation.repository.server", () => ({
  reservationServerRepository: {},
}));
vi.mock("@/app/services/reservation/_helpers/deposit-verify", async () => {
  const actual = await vi.importActual<
    typeof import("@/app/services/reservation/_helpers/deposit-verify")
  >("@/app/services/reservation/_helpers/deposit-verify");
  return {
    ...actual,
    resolveAuthoritativeDamageDeposit: (...a: unknown[]) =>
      resolveAuthoritativeDamageDeposit(...a),
  };
});

import { POST } from "@/app/api/admin/reservations/route";
import { DamageDepositRateUnavailableError } from "@/app/services/reservation/_helpers/deposit-verify";

const body = {
  villa_id: "villa-1",
  start_date: "2026-11-01",
  end_date: "2026-11-05",
  name: "Test",
  phone: "+905551112233",
  total_price: 40000,
  total_price_try: 40000,
  prepayment_amount: 8000,
  remaining_payment: 32000,
  damage_deposit: 500, // client: ham EUR tutarı (yanlış birim) — ezilmeli
};

const req = (b: unknown) =>
  new Request("http://localhost/api/admin/reservations", {
    method: "POST",
    body: JSON.stringify(b),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  createReservation.mockResolvedValue({ id: "r1", reservation_no: "TY-1" });
});

describe("POST /api/admin/reservations — depozito", () => {
  it("server snapshot'ı body'yi ezer; toplam/ödeme alanları aynen kalır", async () => {
    resolveAuthoritativeDamageDeposit.mockResolvedValue({
      damage_deposit: 0,
      damage_deposit_try: 17550.5,
      original_damage_deposit: 500,
      original_damage_deposit_currency: "EUR",
    });
    const res = await POST(req(body));
    expect(res.status).toBe(200);
    expect(resolveAuthoritativeDamageDeposit).toHaveBeenCalledWith("villa-1");
    const sent = createReservation.mock.calls[0][0];
    expect(sent.damage_deposit).toBe(0);
    expect(sent.damage_deposit_try).toBe(17550.5);
    expect(sent.original_damage_deposit).toBe(500);
    expect(sent.original_damage_deposit_currency).toBe("EUR");
    expect(sent.total_price).toBe(40000);
    expect(sent.total_price_try).toBe(40000);
    expect(sent.prepayment_amount).toBe(8000);
    expect(sent.remaining_payment).toBe(32000);
  });

  it("kur yoksa 400 ve rezervasyon OLUŞTURULMAZ", async () => {
    resolveAuthoritativeDamageDeposit.mockRejectedValue(
      new DamageDepositRateUnavailableError("EUR")
    );
    const res = await POST(req(body));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toMatch(/kur/i);
    expect(createReservation).not.toHaveBeenCalled();
  });
});
