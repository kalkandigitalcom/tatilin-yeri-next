import { describe, it, expect, vi, beforeEach } from "vitest";
/* ===============================================================
   🛡️ Migration 099 — depozito para birimi, server-authoritative
   ===============================================================
   - Depozito para birimi toplam / ön ödeme / kalan ödemeyi DEĞİŞTİRMEZ.
   - Yabancı para birimli depozito temizlik ücreti ile AYNI modelde
     yazılır: orijinal tutar + para birimi + kuruşlu NUMERIC TRY
     karşılığı (damage_deposit_try, convertPrice, yuvarlama YOK).
   - Eski INTEGER damage_deposit kolonu yalnız TRY depozitoda dolar;
     yabancı para biriminde 0 (kuruşlu değer integer'a YAZILMAZ).
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
  delete rest.damage_deposit_try;
  delete rest.original_damage_deposit;
  delete rest.original_damage_deposit_currency;
  return rest;
}

/* Canlıdaki gibi küsuratlı kurlar. */
const LIVE_RATES = { USD: 49.7892, EUR: 55.5241, GBP: 66.4389 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("price-verify — depozito para birimi", () => {
  it("TRY depozito: eski davranış (INTEGER kolon + TRY karşılığı aynı tutar)", async () => {
    const v = await verifyPublicReservationPrice(
      arrange("01 TRY 4 gece", { deposit: 5000, deposit_currency: "TRY" })
    );
    expect(v.authoritative!.damage_deposit).toBe(5000);
    expect(v.authoritative!.damage_deposit_try).toBe(5000);
    expect(v.authoritative!.original_damage_deposit).toBe(5000);
    expect(v.authoritative!.original_damage_deposit_currency).toBe("TRY");
  });

  it("deposit_currency NULL (eski villa) → TRY", async () => {
    const v = await verifyPublicReservationPrice(
      arrange("01 TRY 4 gece", { deposit: 5000, deposit_currency: null })
    );
    expect(v.authoritative!.damage_deposit).toBe(5000);
    expect(v.authoritative!.damage_deposit_try).toBe(5000);
    expect(v.authoritative!.original_damage_deposit_currency).toBe("TRY");
  });

  it("EUR depozito: kuruşlu TRY karşılığı NUMERIC alanda; INTEGER alan 0; toplam/ödeme BİREBİR baseline", async () => {
    for (const name of [
      "01 TRY 4 gece",
      "05 EUR villa 4 gece",
      "10 temizlik GBP limit altı, EUR villa",
      "25 kombine: EUR + temizlik GBP + %10 + havuz EUR",
    ]) {
      const v = await verifyPublicReservationPrice(
        arrange(name, { deposit: 500, deposit_currency: "EUR" })
      );
      expect(v.rateUnavailable).toBe(false);
      expect(v.authoritative!.damage_deposit).toBe(0);
      expect(v.authoritative!.damage_deposit_try).toBe(17550);
      expect(v.authoritative!.original_damage_deposit).toBe(500);
      expect(v.authoritative!.original_damage_deposit_currency).toBe("EUR");
      expect(stripDeposit(v.authoritative!)).toEqual(
        BASELINE[name].authoritative
      );
    }
  });

  it.each([
    ["EUR", 200, 11104.82],
    ["USD", 150, 7468.38],
    ["GBP", 120, 7972.67],
  ])(
    "%s %d depozito, küsuratlı kur → damage_deposit_try kuruşlu (%d), yuvarlanmaz; damage_deposit 0 (integer-güvenli)",
    async (currency, amount, expectedTry) => {
      const v = await verifyPublicReservationPrice(
        arrange(
          "05 EUR villa 4 gece",
          { deposit: amount, deposit_currency: currency },
          LIVE_RATES
        )
      );
      expect(v.rateUnavailable).toBe(false);
      expect(v.authoritative!.damage_deposit_try).toBe(expectedTry);
      expect(Number.isInteger(v.authoritative!.damage_deposit_try)).toBe(false);
      expect(v.authoritative!.damage_deposit).toBe(0);
      expect(Number.isInteger(v.authoritative!.damage_deposit)).toBe(true);
      expect(v.authoritative!.original_damage_deposit).toBe(amount);
      expect(v.authoritative!.original_damage_deposit_currency).toBe(currency);
    }
  );

  it("depozito toplam / ön ödeme / kalan ödemeyi DEĞİŞTİRMEZ (küsuratlı kurlarla, TRY vs EUR depozito)", async () => {
    const withTry = await verifyPublicReservationPrice(
      arrange(
        "25 kombine: EUR + temizlik GBP + %10 + havuz EUR",
        { deposit: 5000, deposit_currency: "TRY" },
        LIVE_RATES
      )
    );
    const withEur = await verifyPublicReservationPrice(
      arrange(
        "25 kombine: EUR + temizlik GBP + %10 + havuz EUR",
        { deposit: 200, deposit_currency: "EUR" },
        LIVE_RATES
      )
    );
    expect(stripDeposit(withEur.authoritative!)).toEqual(
      stripDeposit(withTry.authoritative!)
    );
    expect(withEur.poolHeating).toEqual(withTry.poolHeating);
  });

  it("temizlik ücreti davranışı değişmez: GBP temizlik kuruşlu cleaning_fee_try olarak kalır", async () => {
    const v = await verifyPublicReservationPrice(
      arrange(
        "10 temizlik GBP limit altı, EUR villa",
        { deposit: 200, deposit_currency: "EUR" },
        LIVE_RATES
      )
    );
    const a = v.authoritative!;
    expect(a.original_cleaning_currency).toBe("GBP");
    expect(a.original_cleaning_fee).toBeGreaterThan(0);
    expect(a.cleaning_fee_try).toBe(
      Number((a.original_cleaning_fee * LIVE_RATES.GBP).toFixed(2))
    );
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
    expect(v.authoritative!.damage_deposit_try).toBe(0);
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
