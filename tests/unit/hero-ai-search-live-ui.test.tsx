/* ===============================================================
   🧪 HERO AI — CANLI TAKSONOMİ: TİP / ÖZELLİK ÇAKIŞMASI ARAYÜZDE
   ===============================================================
   "ısıtmalı kapalı havuz" ve "çocuk oyun alanı" hem bir villa tipine
   hem bir özelliğe uyar. Arayüz OTOMATİK SEÇMEZ ve otomatik arama
   yapmaz; yalnız bu kriter için küçük bir soru sorar. Cevaptan sonra
   başka not yoksa mevcut /arama URL'sine geçer.
   (Sözlük modül düzeyinde önbelleklendiği için ayrı dosya.)
   =============================================================== */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { getDictionary } from "@/lib/i18n/get-dictionary";

import { LIVE_TAXONOMY } from "./ai-search-live-fixture";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
}));

const dict = getDictionary("tr").home.aiSearch;

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

async function ask(text: string) {
  const { default: HeroAiSearch } = await import("@/app/components/ui/hero/_components/HeroAiSearch");
  render(<HeroAiSearch locale="tr" />);
  fireEvent.change(screen.getByPlaceholderText(dict.placeholder), { target: { value: text } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: dict.submit }));
  });
}
const sleep = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)));

describe("Tip/özellik çakışması — otomatik seçim yok", () => {
  it("ısıtmalı kapalı havuz → soru; özellik seçilince aranır", async () => {
    await ask("Kalkan ısıtmalı kapalı havuz");
    expect(screen.getByText(/birden fazla filtreye uyuyor/)).toBeInTheDocument();
    const typeBtn = screen.getByRole("button", { name: "Kapalı Havuzlu Isıtmalı Villalar" });
    const featBtn = screen.getByRole("button", { name: "Kapalı Havuzu Isıtmalı" });
    expect(typeBtn).toBeInTheDocument();
    await sleep(900);
    expect(pushMock).not.toHaveBeenCalled();
    fireEvent.click(featBtn);
    await waitFor(() => expect(pushMock).toHaveBeenCalledTimes(1), { timeout: 2000 });
    const url = pushMock.mock.calls[0][0] as string;
    expect(url).toMatch(/^\/arama\?/);
    expect(url).toContain("bolgeler=kalkan");
    expect(url).toContain("ozellikler=");
    expect(url).not.toContain("villa-turleri=");
  });

  it("çocuk oyun alanı → soru; tip seçilince aranır", async () => {
    await ask("çocuk oyun alanı olan villa");
    expect(screen.getByRole("button", { name: "Çocuk Oyun Alanlı Villalar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Çocuk Oyun Alanı" })).toBeInTheDocument();
    await sleep(900);
    expect(pushMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Çocuk Oyun Alanlı Villalar" }));
    await waitFor(
      () => expect(pushMock).toHaveBeenCalledWith("/arama?villa-turleri=cocuk-oyun-alanli-villalar"),
      { timeout: 2000 }
    );
  });

  it("Hiçbiri seçilirse ve başka kriter yoksa 'anlaşılamadı' durumuna düşer, arama yapılmaz", async () => {
    await ask("çocuk oyun alanı");
    fireEvent.click(screen.getByRole("button", { name: dict.choiceSkip }));
    expect(screen.getByText(dict.nothingParsed)).toBeInTheDocument();
    await sleep(900);
    expect(pushMock).not.toHaveBeenCalled();
  });
});
