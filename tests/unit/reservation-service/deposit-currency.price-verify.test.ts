import { describe, it, expect, vi, beforeEach } from "vitest";
/* ===============================================================
   🛡️ Migration 099 — depozito para birimi, server-authoritative
   ===============================================================
   - Depozito para birimi toplam / ön ödeme / kalan ödemeyi DEĞİŞTİRMEZ.
   - Yabancı para birimli depozito TRY karşılığı + orijinal ile yazılır.
   - Kur yoksa rezervasyon REDDEDİLİR (rateUnavailable).
   =============================================================== */
const findVillaCleaningConfig = vi.fn();
const getVillaPrices = vi.fn();
const getExchangeRatesMap = vi.fn();
const getPublicSettings = vi.fn();
const getVillaDiscounts = vi.fn();

vi.mock("@/lib/db/reservation.repository", () => ({
  reservationRepository: {
    findVillaCleaningConfig: (...a: unknown[]) => findVillaCleaningConfig(...a),
  },
}));
vi.mock("@/app/services/villa-price.service", () => ({
  getVillaPrices: (...a: unknown[]) => getVillaPrices(...a),
}));
vi.mock("@/app/services/exchange-rate.service", () => ({
  getExchangeRatesMap: (...a: unknown[]) => getExchangeRatesMap(...a),
}));
vi.mock("@/app/services/settings.service", () => ({
  getPublicSettings: (...a: unknown[]) => getPublicSettings(...a),
}));
vi.mock("@/app/services/villa-discount.service", () => ({
  getVillaDiscounts: (...a: unknown[]) => getVillaDiscounts(...a),
}));

import { verifyPublicReservationPrice } from "@/app/services/reservation/_helpers/price-verify";
import type { ReservationCreateInput } from "@/app/services/reservation/types";
import {
  SEC06_SCENARIOS,
  SEC06_RATES,
  SEC06_BASE_VILLA,
} from "./_sec06-price-scenarios";
import baseline from "./__fixtures__/sec06-price-baseline.json";

type Baseline = Record<string, { authoritative: Record<string, unknown> | null }>;
const BASELINE = baseline as Baseline;

function arrange(
  scenarioName: string,
  villaExtra: Record<string, unknown>,
  rates: Record<string, number> = SEC06_RATES
) {
  const s = SEC06_SCENARIOS.find((x) => x.name === scenarioName)!;
  findVillaCleaningConfig.mockResolvedValue({
    data: { ...SEC06_BASE_VILLA, ...(s.villa || {}), ...villaExtra },
    error: null,
  });
  getVillaPrices.mockResolvedValue(s.prices);
  getExchangeRatesMap.mockResolvedValue({ rates, updatedAt: null });
  getPublicSettings.mockResolvedValue(s.settings ?? { prepayment_rate: 20 });
  getVillaDiscounts.mockResolvedValue(s.discounts ?? []);
  return {
    villa_id: "villa-dep",
    start_date: s.start,
    end_date: s.end,
    pool_heating_selected: !!s.pool,
    name: "Test",
    phone: "+905551112233",
  } as ReservationCreateInput;
}

function stripDeposit(a: Record<string, unknown>) {
  const rest = { ...a };
  delete rest.damage_deposit;
  delete rest.original_damage_deposit;
  delete rest.original_damage_deposit_currency;
  return rest;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("price-verify — depozito para birimi", () => {
  it("TRY depozito: eski davranış (TRY, aynı tutar)", async () => {
    const v = await verifyPublicReservationPrice(
      arrange("01 TRY 4 gece", { deposit: 5000, deposit_currency: "TRY" })
    );
    expect(v.authoritative!.damage_deposit).toBe(5000);
    expect(v.authoritative!.original_damage_deposit).toBe(5000);
    expect(v.authoritative!.original_damage_deposit_currency).toBe("TRY");
  });

  it("deposit_currency NULL (eski villa) → TRY", async () => {
    const v = await verifyPublicReservationPrice(
      arrange("01 TRY 4 gece", { deposit: 5000, deposit_currency: null })
    );
    expect(v.authoritative!.damage_deposit).toBe(5000);
    expect(v.authoritative!.original_damage_deposit_currency).toBe("TRY");
  });

  it("EUR depozito: TRY karşılığı + orijinal; toplam/ödeme alanları BİREBİR baseline", async () => {
    for (const name of [
      "01 TRY 4 gece",
      "05 EUR villa 4 gece",
      "25 kombine: EUR + temizlik GBP + %10 + havuz EUR",
    ]) {
      const v = await verifyPublicReservationPrice(
        arrange(name, { deposit: 500, deposit_currency: "EUR" })
      );
      expect(v.rateUnavailable).toBe(false);
      expect(v.authoritative!.damage_deposit).toBe(500 * SEC06_RATES.EUR);
      expect(v.authoritative!.original_damage_deposit).toBe(500);
      expect(v.authoritative!.original_damage_deposit_currency).toBe("EUR");
      expect(stripDeposit(v.authoritative!)).toEqual(
        BASELINE[name].authoritative
      );
    }
  });

  it("EUR depozito + EUR kuru yok → rezervasyon REDDEDİLİR", async () => {
    const v = await verifyPublicReservationPrice(
      arrange(
        "01 TRY 4 gece",
        { deposit: 500, deposit_currency: "EUR" },
        { USD: 32.5, GBP: 41.2 }
      )
    );
    expect(v.rateUnavailable).toBe(true);
    expect(v.authoritative).toBeNull();
  });

  it("EUR para birimi ama depozito 0 → kur aranmaz, reddedilmez", async () => {
    const v = await verifyPublicReservationPrice(
      arrange("01 TRY 4 gece", { deposit: 0, deposit_currency: "EUR" }, {})
    );
    expect(v.rateUnavailable).toBe(false);
    expect(v.authoritative!.damage_deposit).toBe(0);
    expect(stripDeposit(v.authoritative!)).toEqual(
      BASELINE["01 TRY 4 gece"].authoritative
    );
  });

  it("TRY depozito, döviz kurları hiç yok → TRY villa reddedilmez", async () => {
    const v = await verifyPublicReservationPrice(
      arrange("01 TRY 4 gece", { deposit: 5000, deposit_currency: "TRY" }, {})
    );
    expect(v.rateUnavailable).toBe(false);
    expect(v.authoritative!.damage_deposit).toBe(5000);
  });
});
