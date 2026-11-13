import { describe, expect, it } from "vitest";

import { applyChange, externalUidFor, normalizeRanges } from "@/lib/plugins/kiraligim/core/ranges";

const r = (s: string, e: string) => ({ start_date: s, end_date: e });

describe("kiraligim ranges — normalizeRanges", () => {
  it("sıralar, çakışan ve bitişik aralıkları birleştirir", () => {
    expect(normalizeRanges([r("2027-07-10", "2027-07-14"), r("2027-07-01", "2027-07-05"), r("2027-07-05", "2027-07-07"), r("2027-07-12", "2027-07-20")])).toEqual([
      r("2027-07-01", "2027-07-07"),
      r("2027-07-10", "2027-07-20"),
    ]);
  });
  it("geçersiz ve boş aralıkları atar", () => {
    expect(normalizeRanges([r("2027-02-30", "2027-03-02"), r("2027-03-05", "2027-03-05"), r("x", "y"), r("2027-03-09", "2027-03-08")])).toEqual([]);
  });
});

describe("kiraligim ranges — applyChange", () => {
  const base = [r("2027-07-01", "2027-07-10"), r("2027-07-20", "2027-07-25")];

  it("aralık içini temizleyip busy_dates yazar, dışını kırparak korur", () => {
    const out = applyChange(base, {
      start_date: "2027-07-05",
      end_date: "2027-07-22",
      busy_dates: [r("2027-07-12", "2027-07-14")],
    });
    expect(out).toEqual([r("2027-07-01", "2027-07-05"), r("2027-07-12", "2027-07-14"), r("2027-07-22", "2027-07-25")]);
  });

  it("boş busy_dates = aralık açıldı", () => {
    expect(applyChange(base, { start_date: "2027-07-01", end_date: "2027-07-10", busy_dates: [] })).toEqual([
      r("2027-07-20", "2027-07-25"),
    ]);
  });

  it("idempotent: aynı değişiklik iki kez uygulanınca sonuç aynı", () => {
    const ch = { start_date: "2027-07-08", end_date: "2027-07-21", busy_dates: [r("2027-07-15", "2027-07-16")] };
    const once = applyChange(base, ch);
    expect(applyChange(once, ch)).toEqual(once);
  });

  it("busy_dates aralık dışına taşarsa kırpılır; bitişik kalanla birleşir", () => {
    expect(
      applyChange([r("2027-07-01", "2027-07-05")], {
        start_date: "2027-07-05",
        end_date: "2027-07-10",
        busy_dates: [r("2027-07-03", "2027-07-12")],
      }),
    ).toEqual([r("2027-07-01", "2027-07-10")]);
  });

  it("çıkış günü dolu değil: [s,e) yarı açık — bitişik rezervasyonlar ayrı kalmaz ama gün kaymaz", () => {
    expect(applyChange([], { start_date: "2027-08-01", end_date: "2027-08-31", busy_dates: [r("2027-08-10", "2027-08-12")] })).toEqual([
      r("2027-08-10", "2027-08-12"),
    ]);
  });

  it("geçersiz değişiklik aralığı hata verir (sessizce yanlış yazmaz)", () => {
    expect(() => applyChange(base, { start_date: "2027-07-10", end_date: "2027-07-10", busy_dates: [] })).toThrow(
      "invalid_change_range",
    );
    expect(() => applyChange(base, { start_date: "bad", end_date: "2027-07-10", busy_dates: [] })).toThrow();
  });

  it("tam pencere değişikliği (yeniden etkinleşme) her şeyi yeniden kurar", () => {
    expect(
      applyChange(base, { start_date: "2026-01-01", end_date: "2029-01-01", busy_dates: [r("2027-09-01", "2027-09-03")] }),
    ).toEqual([r("2027-09-01", "2027-09-03")]);
  });

  it("externalUidFor aralığa göre sabittir", () => {
    expect(externalUidFor(r("2027-07-01", "2027-07-05"))).toBe("kiraligim:2027-07-01:2027-07-05");
  });
});
