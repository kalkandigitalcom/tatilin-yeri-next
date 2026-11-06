/* ===============================================================
   🧪 HERO AI — CANLI TAKSONOMİ ADLARIYLA DOĞRUDAN ARAMA
   ===============================================================
   DasVilla referansı: "Üzümlü'de 2 kişilik balayı villası arıyorum
   tarihlerim 20 25 haziran" → ara ekran olmadan sonuç sayfası
   (bizde: canonical Üzümlü + Balayı Villaları + 2 kişi + 20–25.06.2027).
   Tip/özellik çakışmaları ve aynı adlı alt bölgeler bağlamla, soru
   sorulmadan çözülür. (Sözlük modül düzeyinde önbelleklendiği için
   ayrı dosya.)
   =============================================================== */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

import { localeHref } from "@/lib/i18n/locale-href";

import { getDictionary } from "@/lib/i18n/get-dictionary";

import { LIVE_TAXONOMY } from "./ai-search-live-fixture";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
}));


beforeEach(() => {
  pushMock.mockReset();
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-11-06T09:00:00Z"));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => LIVE_TAXONOMY }) as Response)
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function ask(text: string, locale: "tr" | "en" | "de" = "tr") {
  const { default: HeroAiSearch } = await import("@/app/components/ui/hero/_components/HeroAiSearch");
  const d = getDictionary(locale).home.aiSearch;
  render(<HeroAiSearch locale={locale} />);
  fireEvent.change(screen.getByPlaceholderText(d.placeholder), { target: { value: text } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: d.submit }));
  });
}

const DASVILLA_TR = "/arama?villa-turleri=balayi-villalari&bolgeler=uzumlu&start=2027-06-20&end=2027-06-25&guests=2";

describe("DasVilla referans sorgusu — doğrudan sonuç", () => {
  it.each([
    ["tr", "Üzümlü'de 2 kişilik balayı villası arıyorum tarihlerim 20 25 haziran"],
    ["tr", "Üzümlü'de 2 kişilik balayı villası 20-25 haziran"],
    ["tr", "Üzümlü balayı villası 2 kişi 20 haziranda giriş 25 haziranda çıkış"],
    ["en", "Honeymoon villa in Uzumlu for 2 people from 20 June to 25 June"],
    ["de", "Flitterwochen-Villa in Üzümlü für 2 Personen vom 20. bis 25. Juni"],
  ] as const)("[%s] %s", async (loc, q) => {
    await ask(q, loc);
    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledWith(localeHref(DASVILLA_TR, loc));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("\"Fethiye Üzümlü\" bağlamı Fethiye'deki kaydı seçer", async () => {
    await ask("Fethiye Üzümlü 2 kişi");
    expect(pushMock).toHaveBeenCalledWith("/arama?bolgeler=fethiye-uzumlu&guests=2");
  });
});

describe("Tip/özellik çakışması — soru yok, bağlamla otomatik", () => {
  it.each([
    ["Kalkan ısıtmalı kapalı havuz", "/arama?bolgeler=kalkan&ozellikler=F%3AKapal%C4%B1+Havuzu+Is%C4%B1tmal%C4%B1"],
    ["Kalkan ısıtmalı kapalı havuzlu villa", "/arama?villa-turleri=kapali-havuzlu-isitmali-villalar&bolgeler=kalkan"],
    ["çocuk oyun alanlı villa", "/arama?villa-turleri=cocuk-oyun-alanli-villalar"],
    ["çocuk oyun alanlı balayı villası", "/arama?villa-turleri=balayi-villalari&ozellikler=F%3A%C3%87ocuk+Oyun+Alan%C4%B1"],
  ])("%s", async (q, url) => {
    await ask(q);
    expect(pushMock).toHaveBeenCalledWith(url);
  });
});
