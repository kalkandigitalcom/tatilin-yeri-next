/* ===============================================================
   🛡️ Gizli villa linki (/v/[token]) — "Rezervasyon Yap" CTA'sı gizli
   ===============================================================
   Gizli link pasif villayı gösterir; rezervasyon sayfası pasif villayı
   bulamadığı için CTA gösterilmez. Tarih + fiyat hesabı AYNEN kalır.
   Normal villa sayfası (prop verilmez) DEĞİŞMEZ.
   Network yok: fetch + settings action mock'lanır (pool-heating testi
   ile aynı desen).
=============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("@/app/services/settings.action", () => ({
  getPublicSettingsAction: vi.fn(async () => ({ prepayment_rate: 0 })),
}));

import BookingSidebar from "@/app/components/villa/BookingSidebar";
import type { VillaPriceEmbed } from "@/lib/villa-row.types";

const PRICES: VillaPriceEmbed[] = [
  { price: 4000, currency: "TRY", start_date: "2026-10-01", end_date: "2026-12-31" },
];

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, ranges: [] }),
    })) as unknown as typeof fetch
  );
});

const PROPS = {
  villaSlug: "test-villa",
  villaId: "v1",
  prices: PRICES,
  cleaning_fee: 3500,
  cleaning_currency: "TRY",
  custom_prepayment_rate: 20,
  initialStart: "2026-10-05",
  initialEnd: "2026-10-10",
};

/* Özet (fiyat) metni — CTA metni hariç. */
async function renderAndReadSummary(hide?: boolean) {
  const { container } = render(
    <BookingSidebar {...PROPS} {...(hide ? { hideReservationCta: true } : {})} />
  );
  await waitFor(() => expect(screen.getByText(/Toplam Tutar/)).toBeTruthy());
  const text = (container.textContent || "").replace("Rezervasyon Yap", "");
  const cta = screen.queryByRole("button", { name: "Rezervasyon Yap" });
  cleanup();
  return { text, cta };
}

describe("BookingSidebar — hideReservationCta", () => {
  it("varsayılan (normal villa sayfası): CTA görünür", async () => {
    const { cta } = await renderAndReadSummary();
    expect(cta).not.toBeNull();
  });

  it("gizli link: CTA YOK, fiyat özeti normal sayfayla BİREBİR aynı", async () => {
    const normal = await renderAndReadSummary();
    const hidden = await renderAndReadSummary(true);
    expect(hidden.cta).toBeNull();
    expect(hidden.text).toContain("Toplam Tutar");
    expect(hidden.text).toBe(normal.text);
  });
});

describe("prop yalnız gizli link (pasif villa) için", () => {
  const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf-8");
  const code = (rel: string) =>
    read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

  it("PrivateVillaPageBody normal detay gövdesini (VillaDetailBody) kullanır; CTA yalnız PASİF villada gizli", () => {
    const src = code("app/components/private-villa/PrivateVillaPageBody.tsx");
    expect(src).toMatch(
      /<VillaDetailBody[\s\S]*?hideReservationCta=\{villa\.is_active === false\}[\s\S]*?\/>/
    );
    /* Kopya UI yok: BookingSidebar doğrudan render edilmez. */
    expect(src).not.toMatch(/<BookingSidebar/);
    /* Off-market SEO: JSON-LD verilmez. */
    expect(src).not.toMatch(/vacationRentalLd|breadcrumbLd|JsonLd/);
  });

  it("VillaDetailBody prop'u yalnız BookingSidebar'a iletir", () => {
    expect(code("app/components/villa/VillaDetailBody.tsx")).toMatch(
      /<BookingSidebar[\s\S]*?hideReservationCta=\{hideReservationCta\}[\s\S]*?\/>/
    );
  });

  /* 🌐 Faz 6 Dalga 2 — normal villa detay artık TEK modül (üç dil). */
  it.each([
    "app/(public)/_routes/villa.tsx",
    "app/(public)/[lang]/(site)/kiralik-villa/[slug]/page.tsx",
  ])("normal villa detay sayfası prop'u VERMEZ: %s", (rel) => {
    expect(read(rel)).not.toContain("hideReservationCta");
  });
});
