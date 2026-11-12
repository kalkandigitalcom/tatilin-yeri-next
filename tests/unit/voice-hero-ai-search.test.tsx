/* ===============================================================
   🧪 SESLİ ARAMA — HERO AI ARAMA ENTEGRASYONU (sahte SpeechRecognition)
   ===============================================================
   Gerçek mikrofon/tarayıcı yok: `window.webkitSpeechRecognition` sahte
   bir sınıfla değiştirilir, olaylar test içinden tetiklenir.
   Doğrulananlar:
     • Destek yoksa mikrofon butonu YOK; yazılı arama aynen çalışır.
     • TR/EN/DE sayfa dili → tr-TR / en-GB / de-DE.
     • Mevcut metin silinmez; konuşma sona eklenir; anlık metin görünür.
     • Konuşma bitince OTOMATİK ARAMA YOK; Villa Bul → yazılı aramayla
       BİREBİR aynı URL (mevcut parser + parametreler).
     • İptal: tamamlanmamış metin eklenmez. Çift tıklama tek oturum.
     • İzin reddi, hizmet kapalı, mikrofon yok, ağ yok, konuşma yok,
       start() istisnası → doğru mesaj, metin korunur.
     • Yazmaya başlama, Villa Bul, örnek çip, Tarihle Ara sekmesi, sayfa
       gizlenmesi, dil değişimi, unmount → dinleme durur, işleyiciler
       temizlenir.
     • Mikrofon tıklaması metin alanına odaklanmaz (mobil klavye açılmaz).
   =============================================================== */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

import { getDictionary } from "@/lib/i18n/get-dictionary";
import type { Locale } from "@/lib/i18n/config";

import { TAXONOMY } from "./ai-search-fixtures";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
}));

const dict = getDictionary("tr").home.aiSearch;

/* ------------------------------ sahte API ------------------------------ */
type Handler<E = unknown> = ((e: E) => void) | null;
class FakeRecognition {
  static instances: FakeRecognition[] = [];
  static throwOnStart = false;
  lang = "";
  continuous = true;
  interimResults = false;
  maxAlternatives = 0;
  onstart: Handler = null;
  onend: Handler = null;
  onerror: Handler<{ error: string }> = null;
  onresult: Handler<unknown> = null;
  onnomatch: Handler = null;
  onspeechstart: Handler = null;
  onspeechend: Handler = null;
  started = 0;
  stopped = 0;
  aborted = 0;
  constructor() {
    FakeRecognition.instances.push(this);
  }
  start() {
    if (FakeRecognition.throwOnStart) throw new Error("InvalidStateError");
    this.started++;
  }
  stop() {
    this.stopped++;
  }
  abort() {
    this.aborted++;
  }
  /* test yardımcıları */
  emitStart() {
    act(() => this.onstart?.(undefined));
  }
  emitResult(parts: Array<[string, boolean]>) {
    const results = parts.map(([t, f]) => Object.assign([{ transcript: t }], { isFinal: f }));
    act(() => this.onresult?.({ resultIndex: 0, results }));
  }
  emitError(code: string) {
    act(() => this.onerror?.({ error: code }));
  }
  emitEnd() {
    act(() => this.onend?.(undefined));
  }
  get detached() {
    return this.onresult === null && this.onend === null && this.onerror === null && this.onstart === null;
  }
}
const last = () => FakeRecognition.instances[FakeRecognition.instances.length - 1];

beforeEach(() => {
  pushMock.mockReset();
  FakeRecognition.instances = [];
  FakeRecognition.throwOnStart = false;
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-11-06T09:00:00Z"));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => TAXONOMY }) as Response)
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
  delete (window as unknown as Record<string, unknown>).SpeechRecognition;
});

function enableSpeech() {
  (window as unknown as Record<string, unknown>).webkitSpeechRecognition = FakeRecognition;
}

async function renderAi(locale: Locale = "tr", active = true) {
  const { default: HeroAiSearch } = await import("@/app/components/ui/hero/_components/HeroAiSearch");
  const utils = render(<HeroAiSearch locale={locale} active={active} />);
  const d = getDictionary(locale).home.aiSearch;
  const input = screen.getByPlaceholderText(d.placeholder) as HTMLTextAreaElement;
  return { ...utils, HeroAiSearch, input, d };
}

const mic = (d = dict) => screen.getByRole("button", { name: d.voiceStart });

async function submit(d = dict) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: d.submit }));
  });
}

/* ------------------------------------------------------------------ */

describe("destek yok → yazılı arama aynen", () => {
  it("mikrofon butonu render edilmez; yazılı arama mevcut URL'yi üretir", async () => {
    const { input } = await renderAi();
    expect(screen.queryByRole("button", { name: dict.voiceStart })).toBeNull();
    fireEvent.change(input, { target: { value: "muhafazakar balayı villası 2 kişi" } });
    await submit();
    expect(pushMock).toHaveBeenCalledWith("/arama?villa-turleri=muhafazakar-villalar%2Cbalayi-villalari&guests=2");
  });
});

describe("dil seçimi", () => {
  it.each([
    ["tr", "tr-TR"],
    ["en", "en-GB"],
    ["de", "de-DE"],
  ] as const)("%s sayfası → %s", async (locale, lang) => {
    enableSpeech();
    const { d } = await renderAi(locale);
    fireEvent.click(mic(d));
    expect(last().lang).toBe(lang);
    expect(last().interimResults).toBe(true);
    expect(last().continuous).toBe(false);
  });

  it("dil değişince açık oturum iptal edilir, sonraki oturum yeni dille açılır", async () => {
    enableSpeech();
    const { rerender, HeroAiSearch } = await renderAi("tr");
    fireEvent.click(mic());
    const first = last();
    first.emitStart();
    rerender(<HeroAiSearch locale="de" />);
    expect(first.aborted).toBe(1);
    first.emitEnd();
    const de = getDictionary("de").home.aiSearch;
    fireEvent.click(screen.getByRole("button", { name: de.voiceStart }));
    expect(last()).not.toBe(first);
    expect(last().lang).toBe("de-DE");
  });
});

describe("metin birleştirme ve otomatik arama YOK", () => {
  it("mevcut metin korunur, konuşma anlık eklenir, bitişte arama başlamaz", async () => {
    enableSpeech();
    const { input } = await renderAi();
    fireEvent.change(input, { target: { value: "Kalkan" } });
    fireEvent.click(mic());
    const r = last();
    r.emitStart();
    expect(screen.getByRole("button", { name: dict.voiceStop })).toBeTruthy();
    expect(screen.getByText(dict.voiceListening)).toBeTruthy();
    expect(screen.getByText(dict.voicePrivacy)).toBeTruthy();
    r.emitResult([["6 kişilik", false]]);
    expect(input.value).toBe("Kalkan 6 kişilik");
    r.emitResult([["6 kişilik jakuzili villa", true]]);
    expect(input.value).toBe("Kalkan 6 kişilik jakuzili villa");
    r.emitEnd();
    expect(input.value).toBe("Kalkan 6 kişilik jakuzili villa");
    expect(screen.getByText(dict.voiceDone)).toBeTruthy();
    await act(async () => {
      await new Promise((res) => setTimeout(res, 50));
    });
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("Villa Bul → yazılı aramayla BİREBİR aynı URL (mevcut parser)", async () => {
    // 1) yazılı
    const typed = await renderAi();
    fireEvent.change(typed.input, { target: { value: "muhafazakar balayı villası 2 kişi" } });
    await submit();
    const typedUrl = pushMock.mock.calls[0][0];
    typed.unmount();
    pushMock.mockReset();
    // 2) sesli
    enableSpeech();
    const { input } = await renderAi();
    fireEvent.click(mic());
    last().emitStart();
    last().emitResult([["muhafazakar balayı villası 2 kişi", true]]);
    last().emitEnd();
    expect(input.value).toBe("muhafazakar balayı villası 2 kişi");
    expect(pushMock).not.toHaveBeenCalled();
    await submit();
    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(pushMock.mock.calls[0][0]).toBe(typedUrl);
  });

  it("kullanıcı Durdur'a basarsa son anlık metin alanda kalır", async () => {
    enableSpeech();
    const { input } = await renderAi();
    fireEvent.click(mic());
    const r = last();
    r.emitStart();
    r.emitResult([["Kaş'ta villa", false]]);
    fireEvent.click(screen.getByRole("button", { name: dict.voiceStop }));
    expect(r.stopped).toBe(1);
    r.emitEnd();
    expect(input.value).toBe("Kaş'ta villa");
    expect(pushMock).not.toHaveBeenCalled();
  });
});

describe("iptal ve tek oturum", () => {
  it("İptal: tamamlanmamış konuşma eklenmez, mevcut metin kalır", async () => {
    enableSpeech();
    const { input } = await renderAi();
    fireEvent.change(input, { target: { value: "Fethiye" } });
    fireEvent.click(mic());
    const r = last();
    r.emitStart();
    r.emitResult([["balayı villası", false]]);
    expect(input.value).toBe("Fethiye balayı villası");
    fireEvent.click(screen.getByRole("button", { name: dict.voiceCancel }));
    expect(r.aborted).toBe(1);
    r.emitError("aborted");
    r.emitEnd();
    expect(input.value).toBe("Fethiye");
    expect(screen.queryByText(dict.voiceError)).toBeNull();
  });

  it("Esc iptal eder", async () => {
    enableSpeech();
    const { input } = await renderAi();
    fireEvent.click(mic());
    last().emitStart();
    last().emitResult([["jakuzili", false]]);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(last().aborted).toBe(1);
    last().emitEnd();
    expect(input.value).toBe("");
  });

  it("hızlı ve tekrarlı tıklama tek oturum açar", async () => {
    enableSpeech();
    await renderAi();
    const button = mic();
    fireEvent.click(button);
    fireEvent.click(screen.getByRole("button", { pressed: true }));
    fireEvent.click(screen.getByRole("button", { pressed: true }));
    expect(FakeRecognition.instances).toHaveLength(1);
    expect(last().started).toBe(1);
  });
});

describe("hata senaryoları (metin korunur, arama başlamaz)", () => {
  it.each([
    ["not-allowed", "voiceDenied"],
    ["service-not-allowed", "voiceServiceOff"],
    ["audio-capture", "voiceMicUnavailable"],
    ["network", "voiceNetwork"],
    ["no-speech", "voiceNoSpeech"],
    ["language-not-supported", "voiceLanguage"],
  ] as const)("%s → doğru mesaj", async (code, key) => {
    enableSpeech();
    const { input } = await renderAi();
    fireEvent.change(input, { target: { value: "Kalkan" } });
    fireEvent.click(mic());
    last().emitError(code);
    last().emitEnd();
    expect(screen.getByText(dict[key])).toBeTruthy();
    expect(input.value).toBe("Kalkan");
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("izin reddinde ikon 'kapalı' durumuna geçer; tekrar denemek mümkündür (otomatik deneme yok)", async () => {
    enableSpeech();
    await renderAi();
    fireEvent.click(mic());
    last().emitError("not-allowed");
    last().emitEnd();
    expect(FakeRecognition.instances).toHaveLength(1);
    expect(mic().getAttribute("data-voice-status")).toBe("error");
    fireEvent.click(mic());
    expect(FakeRecognition.instances).toHaveLength(2);
  });

  it("konuşma sonuçsuz biterse 'duyamadık' mesajı", async () => {
    enableSpeech();
    await renderAi();
    fireEvent.click(mic());
    last().emitStart();
    last().emitEnd();
    expect(screen.getByText(dict.voiceNoSpeech)).toBeTruthy();
  });

  it("çevrimdışı: mikrofon hiç açılmaz, ağ mesajı", async () => {
    enableSpeech();
    const spy = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await renderAi();
    fireEvent.click(mic());
    expect(FakeRecognition.instances).toHaveLength(0);
    expect(screen.getByText(dict.voiceNetwork)).toBeTruthy();
    spy.mockRestore();
  });

  it("start() istisnası → genel hata, oturum kalmaz", async () => {
    enableSpeech();
    FakeRecognition.throwOnStart = true;
    await renderAi();
    fireEvent.click(mic());
    expect(screen.getByText(dict.voiceError)).toBeTruthy();
    expect(last().detached).toBe(true);
    FakeRecognition.throwOnStart = false;
    fireEvent.click(mic());
    expect(FakeRecognition.instances).toHaveLength(2);
  });
});

describe("dinlemeyi durduran kullanıcı eylemleri", () => {
  it("yazmaya başlama: dinleme bırakılır, yazılan korunur, sonraki sonuçlar yok sayılır", async () => {
    enableSpeech();
    const { input } = await renderAi();
    fireEvent.click(mic());
    const r = last();
    r.emitStart();
    r.emitResult([["Kalkan", false]]);
    fireEvent.change(input, { target: { value: "Kalkan 4 kişi" } });
    expect(r.aborted).toBe(1);
    r.emitResult([["Kalkan jakuzili", false]]);
    r.emitEnd();
    expect(input.value).toBe("Kalkan 4 kişi");
  });

  it("dinlerken Villa Bul: dinleme bırakılır, o anki metinle mevcut arama yapılır", async () => {
    enableSpeech();
    const { input } = await renderAi();
    fireEvent.click(mic());
    const r = last();
    r.emitStart();
    r.emitResult([["muhafazakar balayı villası 2 kişi", false]]);
    await submit();
    expect(r.aborted).toBe(1);
    expect(pushMock).toHaveBeenCalledWith("/arama?villa-turleri=muhafazakar-villalar%2Cbalayi-villalari&guests=2");
    r.emitEnd();
    expect(input.value).toBe("muhafazakar balayı villası 2 kişi");
  });

  it("örnek çip: dinleme bırakılır, çip mevcut davranışıyla aranır", async () => {
    enableSpeech();
    await renderAi();
    fireEvent.click(mic());
    last().emitStart();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: dict.example3 }));
    });
    expect(last().aborted).toBe(1);
    expect(pushMock).toHaveBeenCalledTimes(1);
  });

  it("sayfa arka plana alınınca (visibilitychange: hidden) iptal", async () => {
    enableSpeech();
    const { input } = await renderAi();
    fireEvent.click(mic());
    const r = last();
    r.emitStart();
    r.emitResult([["Kaş", false]]);
    const vis = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    vis.mockRestore();
    expect(r.aborted).toBe(1);
    r.emitEnd();
    expect(input.value).toBe("");
  });

  it("pagehide → iptal", async () => {
    enableSpeech();
    await renderAi();
    fireEvent.click(mic());
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(last().aborted).toBe(1);
  });

  it("panel gizlenince (active=false, Tarihle Ara sekmesi) iptal", async () => {
    enableSpeech();
    const { rerender, HeroAiSearch } = await renderAi();
    fireEvent.click(mic());
    const r = last();
    r.emitStart();
    rerender(<HeroAiSearch locale="tr" active={false} />);
    expect(r.aborted).toBe(1);
  });

  it("unmount: abort + tüm olay işleyicileri temizlenir", async () => {
    enableSpeech();
    const { unmount } = await renderAi();
    fireEvent.click(mic());
    const r = last();
    r.emitStart();
    unmount();
    expect(r.aborted).toBe(1);
    expect(r.detached).toBe(true);
  });
});

describe("mobil: mikrofon tıklaması klavyeyi açmaz", () => {
  it("metin alanına odak taşınmaz", async () => {
    enableSpeech();
    const { input } = await renderAi();
    fireEvent.click(mic());
    expect(document.activeElement).not.toBe(input);
  });
});

describe("Hero sekmeleri ile entegrasyon", () => {
  it("AI → Tarihle Ara geçişi açık dinlemeyi iptal eder", async () => {
    enableSpeech();
    const { default: HeroSearchModes } = await import("@/app/components/ui/hero/_components/HeroSearchModes");
    render(
      <HeroSearchModes locale="tr">
        <div data-testid="date-panel">date</div>
      </HeroSearchModes>
    );
    fireEvent.click(screen.getByRole("tab", { name: dict.tabAi }));
    await screen.findByPlaceholderText(dict.placeholder);
    fireEvent.click(mic());
    const r = last();
    r.emitStart();
    fireEvent.click(screen.getByRole("tab", { name: dict.tabDate }));
    expect(r.aborted).toBe(1);
  });
});
