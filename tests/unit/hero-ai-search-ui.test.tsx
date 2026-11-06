/* ===============================================================
   🧪 HERO — "Tarihle Ara" | "Yapay Zekâ ile Ara" ARAYÜZ TESTLERİ
   ===============================================================
   • Varsayılan sekme "Tarihle Ara"; panel (children) değişmeden
     render edilir ve AI sekmesine geçince unmount EDİLMEZ.
   • Doğrudan arama: "Villa Bul" → ayrıştır → otomatik çöz → mevcut
     /arama URL'si (router.push). Ara ekran, özet, soru, takvim veya
     ikinci onay düğmesi YOK.
   • Belirsizlikler bağlamla otomatik çözülür; desteklenmeyen /
     anlaşılmayan / geçersiz tarih ifadeleri aramayı durdurmaz.
   • Hiçbir kriter tanınmazsa yönlendirme yok: kısa satır + Tarihle Ara.
   =============================================================== */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";

import { getDictionary } from "@/lib/i18n/get-dictionary";
import { localeHref } from "@/lib/i18n/locale-href";

import { TAXONOMY } from "./ai-search-fixtures";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
}));

const dict = getDictionary("tr").home.aiSearch;

function DatePanelStub() {
  const [n, setN] = useState(0);
  return (
    <div className="relative mt-12 md:mt-16 hero-panel-in" data-testid="date-panel">
      <button type="button" onClick={() => setN((x) => x + 1)}>
        count {n}
      </button>
    </div>
  );
}

beforeEach(() => {
  pushMock.mockReset();
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-11-06T09:00:00Z"));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      expect(url).toBe("/api/public/taxonomies");
      return { ok: true, status: 200, json: async () => TAXONOMY } as Response;
    })
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function renderModes() {
  const { default: HeroSearchModes } = await import("@/app/components/ui/hero/_components/HeroSearchModes");
  render(
    <HeroSearchModes locale="tr">
      <DatePanelStub />
    </HeroSearchModes>
  );
}

async function openAi() {
  fireEvent.click(screen.getByRole("tab", { name: dict.tabAi }));
  return await screen.findByPlaceholderText(dict.placeholder);
}

async function ask(text: string) {
  const input = await openAi();
  fireEvent.change(input, { target: { value: text } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: dict.submit }));
  });
}

/** Ara ekran olmadığını doğrular: diyalog, özet bölgesi, ikinci düğme yok. */
function expectNoIntermediateUi() {
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.queryByRole("region")).not.toBeInTheDocument();
  expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  expect(document.querySelector('input[type="date"]')).toBeNull();
}

describe("HeroSearchModes", () => {
  it("varsayılan: Tarihle Ara seçili, panel görünür", async () => {
    await renderModes();
    expect(screen.getByRole("tab", { name: dict.tabDate })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: dict.tabAi })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByTestId("date-panel")).toBeVisible();
    expect(screen.queryByPlaceholderText(dict.placeholder)).not.toBeInTheDocument();
  });

  it("AI sekmesine geçiş Tarihle Ara panelini unmount etmez (state korunur)", async () => {
    await renderModes();
    fireEvent.click(screen.getByText("count 0"));
    await openAi();
    expect(screen.getByTestId("date-panel")).not.toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: dict.tabDate }));
    expect(screen.getByText("count 1")).toBeVisible();
  });
});

describe("HeroAiSearch — doğrudan arama", () => {
  it("Villa Bul → ara ekran olmadan doğrudan /arama", async () => {
    await renderModes();
    await ask("Kalkan'da 6 kişilik, korunaklı havuzlu ve jakuzili villa arıyorum.");
    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledWith("/arama?bolgeler=kalkan&guests=6&ozellikler=f-kor%2Cf-jak");
    expectNoIntermediateUi();
  });

  it("Enter tuşu da doğrudan arar", async () => {
    await renderModes();
    const input = await openAi();
    fireEvent.change(input, { target: { value: "Kaş 4 kişi" } });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    expect(pushMock).toHaveBeenCalledWith("/arama?bolgeler=kas&guests=4");
  });

  it("çoklu villa tipi → soru yok; villa kelimesine bağlı tip (baş isim) seçilir", async () => {
    await renderModes();
    await ask("muhafazakar balayı villası 2 kişi");
    expect(pushMock).toHaveBeenCalledWith("/arama?villa-turleri=balayi-villalari&guests=2");
    expectNoIntermediateUi();
  });

  it("desteklenmeyen + anlaşılmayan ifadeler aramayı durdurmaz, URL'ye girmez", async () => {
    await renderModes();
    await ask("Kalkan 3 yatak odalı denize yakın sessiz villa");
    expect(pushMock).toHaveBeenCalledWith("/arama?bolgeler=kalkan");
  });

  it("yalnız ay → tarih gönderilmez, takvim/soru açılmaz", async () => {
    await renderModes();
    await ask("Ağustos ayında Kalkan");
    expect(pushMock).toHaveBeenCalledWith("/arama?bolgeler=kalkan");
    expectNoIntermediateUi();
  });

  it("geçersiz tarih (30 Şubat) → tarih uygulanmadan diğer kriterlerle aranır", async () => {
    await renderModes();
    await ask("30 Şubat Kalkan 4 kişi");
    expect(pushMock).toHaveBeenCalledWith("/arama?bolgeler=kalkan&guests=4");
  });

  it("tarih aralığı (yıl yok) → gelecekteki ilk uygun yıl, YYYY-MM-DD", async () => {
    await renderModes();
    await ask("2-8 Ağustos Kaş'ta 4 kişilik");
    expect(pushMock).toHaveBeenCalledWith("/arama?bolgeler=kas&start=2027-08-02&end=2027-08-08&guests=4");
  });

  it("\"20 25 haziran\" ayırıcısız aralık", async () => {
    await renderModes();
    await ask("Kaş 2 kişi tarihlerim 20 25 haziran");
    expect(pushMock).toHaveBeenCalledWith("/arama?bolgeler=kas&start=2027-06-20&end=2027-06-25&guests=2");
  });

  it("hiçbir kriter yoksa yönlendirme yok; kısa satır + Tarihle Ara", async () => {
    await renderModes();
    await ask("asdf qwerty");
    expect(pushMock).not.toHaveBeenCalled();
    expect(screen.getByText(dict.nothingParsed)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: dict.switchToDate }));
    expect(screen.getByRole("tab", { name: dict.tabDate })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("date-panel")).toBeVisible();
  });

  it("örnek arama tıklanınca doğrudan aranır", async () => {
    await renderModes();
    await openAi();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: dict.example3 }));
    });
    expect(pushMock).toHaveBeenCalledWith("/arama?villa-turleri=balayi-villalari&bolgeler=fethiye&guests=2");
  });

  it.each([
    ["en", "Conservative villa in Kas for 2 people", "/arama?villa-turleri=muhafazakar-villalar&bolgeler=kas&guests=2", /^\/en\/search\?/],
    ["de", "Flitterwochen Villa in Kalkan für 2 Personen vom 20. bis 25. Juni", "/arama?villa-turleri=balayi-villalari&bolgeler=kalkan&start=2027-06-20&end=2027-06-25&guests=2", /^\/de\/suche\?/],
  ] as const)("%s: doğrudan localeHref hedefi", async (loc, q, path, re) => {
    const { default: HeroSearchModes } = await import("@/app/components/ui/hero/_components/HeroSearchModes");
    const d = getDictionary(loc).home.aiSearch;
    render(
      <HeroSearchModes locale={loc}>
        <DatePanelStub />
      </HeroSearchModes>
    );
    fireEvent.click(screen.getByRole("tab", { name: d.tabAi }));
    const input = await screen.findByPlaceholderText(d.placeholder);
    fireEvent.change(input, { target: { value: q } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: d.submit }));
    });
    expect(pushMock).toHaveBeenCalledWith(localeHref(path, loc));
    expect(pushMock.mock.calls[0][0]).toMatch(re);
  });

  it("kullanıcı metni taksonomi isteği dışında hiçbir yere gönderilmez", async () => {
    await renderModes();
    await ask("Kalkan 6 kişilik gizli-metin-123");
    const calls = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(calls.every(([u]) => u === "/api/public/taxonomies")).toBe(true);
    expect(JSON.stringify(calls)).not.toContain("gizli");
    expect(JSON.stringify(pushMock.mock.calls)).not.toContain("gizli");
  });
});
