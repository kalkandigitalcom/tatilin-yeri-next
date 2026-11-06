/* ===============================================================
   🧪 HERO — "Tarihle Ara" | "Yapay Zekâ ile Ara" ARAYÜZ TESTLERİ
   ===============================================================
   • Varsayılan sekme "Tarihle Ara"; panel (children) değişmeden
     render edilir ve AI sekmesine geçince unmount EDİLMEZ.
   • B temelli akıllı karma akış:
       – temiz sonuç → kompakt "Anladığım" özeti → otomatik /arama;
       – "Düzenle" / çip düzenleme otomatik geçişi iptal eder;
       – seçim gereken kriter → yalnız o soru (sırayla);
       – tarih sorunu → "Tarih seç" | "Tarihsiz ara";
       – desteklenmeyen/anlaşılmayan → uyarı + "Villaları göster"
         (otomatik geçiş YOK, hiçbir kriter sessizce kaybolmaz);
       – hiçbir şey → örnekler + Tarihle Ara'ya geç.
   • Çip düzenleyici: masaüstünde popover, mobilde alt sayfa (portal).
   =============================================================== */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

const fmt = (tpl: string, v: Record<string, string | number>) =>
  tpl.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k]));
const editName = (label: string) => fmt(dict.editChip, { label });
const sleep = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)));
const summary = () => screen.getByRole("region", { name: dict.understoodLabel });
const expectPush = (url: string) => waitFor(() => expect(pushMock).toHaveBeenCalledWith(url), { timeout: 2000 });

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

describe("HeroAiSearch — akıllı karma akış", () => {
  it("temiz sonuç: kompakt özet çipleri → kısa bekleme → otomatik /arama", async () => {
    await renderModes();
    await ask("Kalkan'da 6 kişilik, korunaklı havuzlu ve jakuzili villa arıyorum.");
    const s = summary();
    expect(within(s).getByRole("button", { name: editName("Kalkan") })).toBeInTheDocument();
    expect(within(s).getByRole("button", { name: editName("6 kişi") })).toBeInTheDocument();
    expect(within(s).getByRole("button", { name: editName("Korunaklı Havuz") })).toBeInTheDocument();
    expect(within(s).getByRole("button", { name: editName("Jakuzi") })).toBeInTheDocument();
    expect(screen.getByText(dict.redirecting)).toBeInTheDocument();
    expect(screen.queryByText(dict.reviewTitle)).not.toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
    await expectPush("/arama?bolgeler=kalkan&guests=6&ozellikler=f-kor%2Cf-jak");
    expect(pushMock).toHaveBeenCalledTimes(1);
  });

  it("Düzenle otomatik geçişi iptal eder; Villaları göster ile aranır", async () => {
    await renderModes();
    await ask("Kalkan'da 6 kişilik jakuzili villa");
    fireEvent.click(screen.getByRole("button", { name: dict.editCriteria }));
    await sleep(900);
    expect(pushMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: dict.showVillas }));
    expect(pushMock).toHaveBeenCalledWith("/arama?bolgeler=kalkan&guests=6&ozellikler=f-jak");
  });

  it("çipe dokununca popover açılır; kişi ve özellik düzenlemesi URL'ye yansır", async () => {
    await renderModes();
    await ask("Kalkan'da 6 kişilik jakuzili villa");
    fireEvent.click(screen.getByRole("button", { name: editName("6 kişi") }));
    const dlg = screen.getByRole("dialog", { name: dict.guestsLabel });
    expect(dlg).not.toHaveAttribute("aria-modal");
    fireEvent.click(within(dlg).getByRole("button", { name: dict.guestsDecrease }));
    fireEvent.click(within(dlg).getByRole("button", { name: dict.guestsDecrease }));
    fireEvent.click(within(dlg).getByRole("button", { name: dict.apply }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: editName("4 kişi") })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: editName("Jakuzi") }));
    fireEvent.click(screen.getByRole("button", { name: "Jakuzi kaldır" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await sleep(900);
    expect(pushMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: dict.showVillas }));
    expect(pushMock).toHaveBeenCalledWith("/arama?bolgeler=kalkan&guests=4");
  });

  it("+ çipi ile yeni kriter (villa tipi) eklenir", async () => {
    await renderModes();
    await ask("Kalkan 2 kişi");
    fireEvent.click(screen.getByRole("button", { name: dict.addCriterion }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: dict.typeLabel }));
    fireEvent.change(screen.getByRole("combobox", { name: dict.chooseType }), { target: { value: "type-bal" } });
    expect(screen.getByRole("button", { name: editName("Balayı Villaları") })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: dict.showVillas }));
    expect(pushMock).toHaveBeenCalledWith("/arama?villa-turleri=balayi-villalari&bolgeler=kalkan&guests=2");
  });

  it("çoklu villa tipi → yalnız o kriter için soru; cevaplanınca otomatik aranır", async () => {
    await renderModes();
    await ask("muhafazakar balayı villası 2 kişi");
    expect(screen.getByText(/Birden fazla villa tipi yazdınız/)).toBeInTheDocument();
    await sleep(900);
    expect(pushMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Balayı Villaları" }));
    await expectPush("/arama?villa-turleri=balayi-villalari&guests=2");
  });

  it("desteklenmeyen + anlaşılamayan → küçük uyarı, otomatik geçiş YOK, Villaları göster", async () => {
    await renderModes();
    await ask("Kalkan 3 yatak odalı denize yakın sessiz villa");
    expect(screen.getByText(`${dict.notFilteredLabel}:`)).toBeInTheDocument();
    expect(screen.getByText("3 yatak odalı")).toBeInTheDocument();
    expect(screen.getByText("denize yakın")).toBeInTheDocument();
    expect(screen.getByText(`${dict.notUnderstoodLabel}:`).parentElement).toHaveTextContent("sessiz");
    expect(screen.getByText(dict.notesHint)).toBeInTheDocument();
    await sleep(900);
    expect(pushMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: dict.showVillas }));
    expect(pushMock).toHaveBeenCalledWith("/arama?bolgeler=kalkan");
  });

  it("yazım önerisi eklenince kalan not yoksa otomatik aranır", async () => {
    await renderModes();
    await ask("Fethye 2 kişi");
    expect(screen.getByText(`${dict.notUnderstoodLabel}:`).parentElement).toHaveTextContent("Fethye");
    expect(pushMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Fethiye ekle" }));
    await expectPush("/arama?bolgeler=fethiye&guests=2");
  });

  it("yalnız ay → tarih sorusu; Tarihsiz ara mevcut kriterlerle arar", async () => {
    await renderModes();
    await ask("Ağustos ayında Kalkan");
    expect(screen.getByText(/Gün aralığı atamadık/)).toBeInTheDocument();
    await sleep(900);
    expect(pushMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: dict.searchWithoutDates }));
    expect(pushMock).toHaveBeenCalledWith("/arama?bolgeler=kalkan");
  });

  it("tarih sorusu → Tarih seç → tarihler uygulanınca otomatik aranır", async () => {
    await renderModes();
    await ask("Ağustos ayında Kalkan 4 kişi");
    fireEvent.click(screen.getByRole("button", { name: dict.pickDates }));
    const dlg = screen.getByRole("dialog", { name: dict.dateLabel });
    const apply = within(dlg).getByRole("button", { name: dict.apply });
    expect(apply).toBeDisabled();
    fireEvent.change(within(dlg).getByLabelText(dict.startLabel), { target: { value: "2027-08-03" } });
    fireEvent.change(within(dlg).getByLabelText(dict.endLabel), { target: { value: "2027-08-10" } });
    fireEvent.click(apply);
    await expectPush("/arama?bolgeler=kalkan&start=2027-08-03&end=2027-08-10&guests=4");
  });

  it("geçersiz tek tarih (30 Şubat) → geçersiz tarih mesajı", async () => {
    await renderModes();
    await ask("30 Şubat Kalkan");
    expect(screen.getByText(fmt(dict.dateIssueInvalidCalendar, { phrase: "30 Şubat" }))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: dict.pickDates })).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("tarih aralığı temizse çip gösterilir ve URL'ye YYYY-MM-DD yazılır", async () => {
    await renderModes();
    await ask("2-8 Ağustos Kaş'ta 4 kişilik");
    expect(within(summary()).getByRole("button", { name: /Ağu/ })).toBeInTheDocument();
    await expectPush("/arama?bolgeler=kas&start=2027-08-02&end=2027-08-08&guests=4");
  });

  it("hiçbir şey anlaşılmadı → örnekler + Tarihle Ara'ya geç", async () => {
    await renderModes();
    await ask("asdf qwerty");
    expect(screen.getByText(dict.nothingParsed)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: dict.understoodLabel })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: dict.example1 })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: dict.showVillas })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: dict.switchToDate }));
    expect(screen.getByRole("tab", { name: dict.tabDate })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("date-panel")).toBeVisible();
  });

  it("mobil: çip düzenleyici body'ye portal edilen alt sayfa (aria-modal) olarak açılır", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((q: string) => ({
        matches: q.includes("max-width"),
        media: q,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
    );
    await renderModes();
    await ask("Kalkan'da 6 kişilik jakuzili villa");
    fireEvent.click(screen.getByRole("button", { name: editName("Kalkan") }));
    const dlg = screen.getByRole("dialog", { name: dict.regionsLabel });
    expect(dlg).toHaveAttribute("aria-modal", "true");
    expect(summary().contains(dlg)).toBe(false);
    expect(document.querySelector("[data-ai-sheet]")).not.toBeNull();
    fireEvent.click(within(dlg).getByRole("button", { name: dict.close }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("EN arayüz: çipler İngilizce, URL Tarihle Ara ile aynı localeHref hedefi", async () => {
    const { default: HeroSearchModes } = await import("@/app/components/ui/hero/_components/HeroSearchModes");
    const en = getDictionary("en").home.aiSearch;
    render(
      <HeroSearchModes locale="en">
        <DatePanelStub />
      </HeroSearchModes>
    );
    fireEvent.click(screen.getByRole("tab", { name: en.tabAi }));
    const input = await screen.findByPlaceholderText(en.placeholder);
    fireEvent.change(input, { target: { value: "Conservative villa in Kas for 2 people" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: en.submit }));
    });
    expect(screen.getByRole("button", { name: fmt(en.editChip, { label: "Conservative Villas" }) })).toBeInTheDocument();
    expect(screen.getByText(en.redirecting)).toBeInTheDocument();
    await expectPush(localeHref("/arama?villa-turleri=muhafazakar-villalar&bolgeler=kas&guests=2", "en"));
    expect(pushMock.mock.calls[0][0]).toMatch(/^\/en\/search\?/);
  });

  it("DE arayüz: URL /de/suche", async () => {
    const { default: HeroSearchModes } = await import("@/app/components/ui/hero/_components/HeroSearchModes");
    const de = getDictionary("de").home.aiSearch;
    render(
      <HeroSearchModes locale="de">
        <DatePanelStub />
      </HeroSearchModes>
    );
    fireEvent.click(screen.getByRole("tab", { name: de.tabAi }));
    const input = await screen.findByPlaceholderText(de.placeholder);
    fireEvent.change(input, { target: { value: "Luxusvilla in Kalkan für 4 Personen" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: de.submit }));
    });
    await expectPush(localeHref("/arama?villa-turleri=luks-villalar&bolgeler=kalkan&guests=4", "de"));
    expect(pushMock.mock.calls[0][0]).toMatch(/^\/de\/suche\?/);
  });

  it("kullanıcı metni taksonomi isteği dışında hiçbir yere gönderilmez", async () => {
    await renderModes();
    await ask("Kalkan 6 kişilik gizli-metin-123");
    const calls = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(calls.every(([u]) => u === "/api/public/taxonomies")).toBe(true);
    expect(JSON.stringify(calls)).not.toContain("gizli");
  });
});
