/* ===============================================================
   🧪 SESLİ ARAMA — ART ARDA OTURUMLAR / TEKRAR DİNLEME (kritik hata)
   ===============================================================
   Sahte SpeechRecognition, gerçek tarayıcıların olay SIRALARINI taklit
   eder:
     • chrome   : start → onstart → onspeechstart → onresult(ara)… →
                  onspeechend → onresult(kesin) → onend
                  stop() → onresult(kesin) + onend · abort() → onerror(aborted) + onend
     • ios      : onstart → onresult(ara)… → (SUSTUKTAN SONRA onend YOK)
                  stop() → onerror(aborted) + onend   (WebKit 321436 yorum 3)
     • hung     : start() sonrası HİÇBİR olay yok; stop()/abort() da olay
                  üretmez (başsız Chromium'da gözlendi)
   Her test, sonraki oturumun GERÇEKTEN start() aldığını ve yeni sonucu
   metin alanına eklediğini doğrular. Arama asla otomatik başlamaz.
   =============================================================== */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";

import { getDictionary } from "@/lib/i18n/get-dictionary";
import type { Locale } from "@/lib/i18n/config";
import { useSpeechRecognition } from "@/app/components/ui/hero/_hooks/useSpeechRecognition";

import { TAXONOMY } from "./ai-search-fixtures";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
}));

const dict = getDictionary("tr").home.aiSearch;

type Engine = "chrome" | "ios" | "hung";
type Ev = { error: string };
type Fn = ((e?: unknown) => void) | null;

class FakeRec {
  static instances: FakeRec[] = [];
  static engine: Engine = "chrome";
  engine: Engine = FakeRec.engine;
  lang = "";
  continuous = true;
  interimResults = false;
  maxAlternatives = 0;
  onstart: Fn = null;
  onend: Fn = null;
  onerror: ((e: Ev) => void) | null = null;
  onresult: Fn = null;
  onnomatch: Fn = null;
  onspeechstart: Fn = null;
  onspeechend: Fn = null;
  started = 0;
  stopped = 0;
  aborted = 0;
  private results: Array<[string, boolean]> = [];
  constructor() {
    FakeRec.instances.push(this);
  }
  start() {
    if (this.started) throw new DOMException("already started", "InvalidStateError");
    this.started++;
  }
  stop() {
    this.stopped++;
    if (this.engine === "chrome") {
      // ara metin kesinleşir ve oturum biter
      this.results = this.results.map(([t]) => [t, true]);
      if (this.results.length) this.fire("result");
      this.fire("end");
    } else if (this.engine === "ios") {
      this.onerror?.({ error: "aborted" });
      this.fire("end");
    }
  }
  abort() {
    this.aborted++;
    if (this.engine !== "hung") {
      this.onerror?.({ error: "aborted" });
      this.fire("end");
    }
  }
  /* —— test yardımcıları —— */
  private fire(type: "start" | "end" | "result" | "speechstart" | "speechend") {
    if (type === "result") {
      const results = this.results.map(([t, f]) => Object.assign([{ transcript: t }], { isFinal: f }));
      this.onresult?.({ resultIndex: 0, results });
    } else {
      const h = this[`on${type}`] as Fn;
      h?.();
    }
  }
  emitStart() {
    act(() => this.fire("start"));
  }
  emitSpeech(text: string, isFinal: boolean) {
    act(() => {
      this.fire("speechstart");
      this.results = [[text, isFinal]];
      this.fire("result");
    });
  }
  emitNaturalEnd(finalText: string) {
    act(() => {
      this.fire("speechend");
      this.results = [[finalText, true]];
      this.fire("result");
      this.fire("end");
    });
  }
  emitError(code: string, withEnd = true) {
    act(() => {
      this.onerror?.({ error: code });
      if (withEnd) this.fire("end");
    });
  }
}
const inst = (i: number) => FakeRec.instances[i];
const w = window as unknown as Record<string, unknown>;
const wait = (ms: number) => act(() => new Promise((r) => setTimeout(r, ms)));

beforeEach(() => {
  pushMock.mockReset();
  FakeRec.instances = [];
  FakeRec.engine = "chrome";
  w.webkitSpeechRecognition = FakeRec;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => TAXONOMY }) as Response)
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete w.webkitSpeechRecognition;
});

async function renderAi(locale: Locale = "tr") {
  const { default: HeroAiSearch } = await import("@/app/components/ui/hero/_components/HeroAiSearch");
  const utils = render(<HeroAiSearch locale={locale} />);
  const input = screen.getByPlaceholderText(getDictionary(locale).home.aiSearch.placeholder) as HTMLTextAreaElement;
  return { ...utils, HeroAiSearch, input };
}
/** Mikrofon butonu (durumdan bağımsız: data-voice-status ile bulunur). */
const micBtn = () => document.querySelector("[data-voice-status]") as HTMLButtonElement;
const tap = () => fireEvent.click(micBtn());
const status = () => micBtn().getAttribute("data-voice-status");

/** Tam bir Chrome oturumu: dokun → onstart → konuş → doğal bitiş. */
function chromeSession(i: number, text: string) {
  tap();
  expect(FakeRec.instances).toHaveLength(i + 1);
  expect(inst(i).started).toBe(1);
  inst(i).emitStart();
  inst(i).emitSpeech(text, false);
  inst(i).emitNaturalEnd(text);
}

/* ================================================================= */

describe("art arda başarılı oturumlar (sayfa yenilemeden)", () => {
  it("3 ardışık oturum: her biri YENİ örnekle start() alır, metin uç uca eklenir, arama başlamaz", async () => {
    const { input } = await renderAi();
    fireEvent.change(input, { target: { value: "Kalkan" } });
    chromeSession(0, "6 kişilik");
    expect(input.value).toBe("Kalkan 6 kişilik");
    expect(status()).toBe("done");
    chromeSession(1, "jakuzili");
    expect(input.value).toBe("Kalkan 6 kişilik jakuzili");
    chromeSession(2, "villa");
    expect(input.value).toBe("Kalkan 6 kişilik jakuzili villa");
    expect(FakeRec.instances).toHaveLength(3);
    expect(new Set(FakeRec.instances).size).toBe(3);
    expect(FakeRec.instances.every((r) => r.started === 1 && r.onresult === null && r.onend === null)).toBe(true);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("onend sonrasında tekrar start: ikinci oturum yeni sonucu alana aktarır", async () => {
    const { input } = await renderAi();
    chromeSession(0, "Kaş'ta villa");
    tap();
    expect(inst(1).started).toBe(1);
    inst(1).emitStart();
    expect(status()).toBe("listening");
    inst(1).emitSpeech("4 kişilik", false);
    expect(input.value).toBe("Kaş'ta villa 4 kişilik");
  });

  it("stop() (kullanıcı Durdur) ardından tekrar start", async () => {
    const { input } = await renderAi();
    tap();
    inst(0).emitStart();
    inst(0).emitSpeech("Fethiye", false);
    act(() => tap()); // Durdur → chrome: kesin sonuç + onend
    expect(inst(0).stopped).toBe(1);
    expect(input.value).toBe("Fethiye");
    expect(status()).toBe("done");
    tap();
    expect(inst(1).started).toBe(1);
    inst(1).emitStart();
    inst(1).emitNaturalEnd("balayı villası");
    expect(input.value).toBe("Fethiye balayı villası");
  });

  it("abort() (İptal) ardından tekrar start: yalnız iptal edilen oturumun ara metni atılır", async () => {
    const { input } = await renderAi();
    chromeSession(0, "Kalkan");
    tap();
    inst(1).emitStart();
    inst(1).emitSpeech("yanlış söz", false);
    expect(input.value).toBe("Kalkan yanlış söz");
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: dict.voiceCancel }));
    });
    expect(inst(1).aborted).toBe(1);
    expect(input.value).toBe("Kalkan"); // önceki oturumun metni korunur
    expect(status()).toBe("idle");
    tap();
    expect(inst(2).started).toBe(1);
    inst(2).emitStart();
    inst(2).emitNaturalEnd("jakuzili");
    expect(input.value).toBe("Kalkan jakuzili");
  });

  it("onerror (no-speech) + onend ardından tekrar start", async () => {
    const { input } = await renderAi();
    tap();
    inst(0).emitStart();
    inst(0).emitError("no-speech");
    expect(screen.getByText(dict.voiceNoSpeech)).toBeTruthy();
    tap();
    expect(inst(1).started).toBe(1);
    inst(1).emitStart();
    inst(1).emitNaturalEnd("Kaş");
    expect(input.value).toBe("Kaş");
  });

  it("onerror geldi ama onend HİÇ gelmedi: kilit kısa sürede açılır, tekrar start çalışır", async () => {
    const { input } = await renderAi();
    tap();
    inst(0).emitStart();
    inst(0).emitError("network", false);
    await wait(900); // errorGraceMs (800) sonra zorla kapanır
    expect(inst(0).aborted).toBe(1); // yerel tanıyıcı bırakıldı
    expect(screen.getByText(dict.voiceNetwork)).toBeTruthy();
    tap();
    expect(inst(1).started).toBe(1);
    inst(1).emitStart();
    inst(1).emitNaturalEnd("Kalkan");
    expect(input.value).toBe("Kalkan");
  });

  it("not-allowed sonrası tekrar deneme: izin sonradan verilince oturum çalışır", async () => {
    const { input } = await renderAi();
    tap();
    inst(0).emitError("not-allowed");
    expect(screen.getByText(dict.voiceDenied)).toBeTruthy();
    expect(status()).toBe("error");
    tap(); // kullanıcı ayarlardan izin verdi
    expect(inst(1).started).toBe(1);
    inst(1).emitStart();
    inst(1).emitNaturalEnd("Fethiye");
    expect(input.value).toBe("Fethiye");
    expect(status()).toBe("done");
  });

  it("internet kesildi → geri geldi: tekrar denenebilir", async () => {
    const { input } = await renderAi();
    const spy = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    tap();
    expect(FakeRec.instances).toHaveLength(0);
    expect(screen.getByText(dict.voiceNetwork)).toBeTruthy();
    spy.mockReturnValue(true);
    tap();
    expect(inst(0).started).toBe(1);
    inst(0).emitStart();
    inst(0).emitNaturalEnd("Kaş");
    expect(input.value).toBe("Kaş");
    spy.mockRestore();
  });
});

describe("eski oturum yeni oturumu bozamaz", () => {
  it("eski oturumun GEÇ gelen onresult/onend/onerror çağrıları yok sayılır", async () => {
    const { input } = await renderAi();
    tap();
    inst(0).emitStart();
    const staleResult = inst(0).onresult!;
    const staleEnd = inst(0).onend!;
    const staleError = inst(0).onerror!;
    inst(0).emitNaturalEnd("Kalkan");
    tap();
    inst(1).emitStart();
    inst(1).emitSpeech("jakuzili", false);
    act(() => {
      staleResult({ resultIndex: 0, results: [Object.assign([{ transcript: "ESKİ METİN" }], { isFinal: true })] });
      staleError({ error: "network" });
      staleEnd();
    });
    expect(input.value).toBe("Kalkan jakuzili");
    expect(status()).toBe("listening");
    inst(1).emitNaturalEnd("jakuzili");
    expect(input.value).toBe("Kalkan jakuzili");
    expect(status()).toBe("done");
  });
});

describe("hızlı tıklamalar ve kapanış aralığı", () => {
  it("tarayıcı onstart'ı geciktirirse: çift dokunuş yok sayılır, sonraki dokunuş takılmış başlatmayı iptal eder, ardından yeni oturum", async () => {
    FakeRec.engine = "hung";
    const { input } = await renderAi();
    tap();
    tap(); // çift dokunuş (≤600 ms): yok sayılır
    expect(FakeRec.instances).toHaveLength(1);
    expect(inst(0).aborted).toBe(0);
    expect(status()).toBe("starting");
    await wait(650);
    tap(); // takılmış başlatma iptal → kilit hemen açılır
    expect(inst(0).aborted).toBe(1);
    expect(status()).toBe("idle");
    FakeRec.engine = "chrome";
    tap(); // yeni oturum
    expect(FakeRec.instances).toHaveLength(2);
    expect(inst(1).started).toBe(1);
    inst(1).emitStart();
    inst(1).emitNaturalEnd("Kalkan");
    expect(input.value).toBe("Kalkan");
  });

  it("iki hızlı tıklama: tek oturum (ikincisi 'durdur' sayılır), sonra yeniden başlatılabilir", async () => {
    await renderAi();
    FakeRec.engine = "hung"; // stop() olay üretmez → oturum 'stopping' durumunda kalır
    tap();
    tap(); // çift dokunuş: yok sayılır
    inst(0).emitStart();
    tap(); // dinleniyor → durdur
    tap(); // kapanıyor → yok sayılır
    expect(FakeRec.instances).toHaveLength(1);
    expect(inst(0).started).toBe(1);
    expect(inst(0).stopped).toBe(1);
    expect(status()).toBe("stopping");
    FakeRec.engine = "chrome";
    await wait(1300); // endGraceMs (1200) → zorla kapanış
    expect(inst(0).aborted).toBe(1);
    tap();
    expect(FakeRec.instances).toHaveLength(2);
    expect(inst(1).started).toBe(1);
  });
});

describe("iOS benzeri motor: sustuktan sonra onend gelmiyor (kök neden)", () => {
  it("sessizlik bekçisi oturumu kapatır; sonraki dokunuş YENİ oturum açar (durdur sayılmaz)", async () => {
    FakeRec.engine = "ios";
    const { input } = await renderAi();
    tap();
    inst(0).emitStart();
    inst(0).emitSpeech("Kalkan'da villa", false); // iOS: kesin sonuç / onend yok
    expect(status()).toBe("listening");
    await wait(2200); // silenceMs (2000) → stop() → aborted + onend
    expect(inst(0).stopped).toBe(1);
    expect(status()).toBe("done");
    expect(input.value).toBe("Kalkan'da villa"); // ara metin korunur, hata gösterilmez
    expect(screen.queryByText(dict.voiceError)).toBeNull();
    tap();
    expect(FakeRec.instances).toHaveLength(2);
    expect(inst(1).started).toBe(1);
    inst(1).emitStart();
    inst(1).emitSpeech("4 kişilik", false);
    expect(input.value).toBe("Kalkan'da villa 4 kişilik");
    expect(pushMock).not.toHaveBeenCalled();
  });
});

describe("arka plan ve dil değişimi", () => {
  it("sayfa arka plana gider ve geri gelir: kapanmayan oturum temizlenir, tekrar başlatılabilir", async () => {
    FakeRec.engine = "hung"; // abort() bile olay üretmiyor
    const { input } = await renderAi();
    tap();
    inst(0).emitStart();
    inst(0).emitSpeech("Kaş", false);
    const vis = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(inst(0).aborted).toBe(1);
    vis.mockReturnValue("visible");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    vis.mockRestore();
    expect(input.value).toBe(""); // iptal: tamamlanmamış metin eklenmez
    FakeRec.engine = "chrome";
    tap();
    expect(FakeRec.instances).toHaveLength(2);
    inst(1).emitStart();
    inst(1).emitNaturalEnd("Kalkan");
    expect(input.value).toBe("Kalkan");
  });

  it("dil değişince yeni dille tekrar dinleme yapılabilir", async () => {
    const { rerender, HeroAiSearch, input } = await renderAi("tr");
    chromeSession(0, "Kalkan");
    rerender(<HeroAiSearch locale="de" />);
    tap();
    expect(inst(1).lang).toBe("de-DE");
    inst(1).emitStart();
    inst(1).emitNaturalEnd("mit Whirlpool");
    expect(input.value).toBe("Kalkan mit Whirlpool");
  });
});

/* =================== hook düzeyi: zamanlayıcılar =================== */

describe("useSpeechRecognition — askıda kalan motor (hiç olay yok)", () => {
  const opts = {
    lang: "tr-TR",
    enabled: true,
    maxLength: 300,
    silenceMs: 30,
    noSpeechMs: 40,
    startTimeoutMs: 40,
    endGraceMs: 30,
    errorGraceMs: 30,
  };

  it("onstart hiç gelmezse: zaman aşımı → abort → zorla kapanış → yeniden başlatılabilir", async () => {
    FakeRec.engine = "hung";
    const texts: string[] = [];
    const { result } = renderHook(() => useSpeechRecognition({ ...opts, onText: (t) => texts.push(t) }));
    act(() => result.current.start("Kalkan"));
    expect(result.current.status).toBe("starting");
    await wait(120);
    expect(inst(0).aborted).toBe(1);
    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe("generic");
    FakeRec.engine = "chrome";
    act(() => result.current.toggle("Kalkan"));
    expect(FakeRec.instances).toHaveLength(2);
    expect(inst(1).started).toBe(1);
  });

  it("onstart geldi ama hiç ses yok: 'duyamadık' ile kapanır, yeniden başlatılabilir", async () => {
    FakeRec.engine = "hung";
    const { result } = renderHook(() => useSpeechRecognition({ ...opts, onText: () => {} }));
    act(() => result.current.start(""));
    inst(0).emitStart();
    await wait(150);
    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe("no-speech");
    act(() => result.current.toggle(""));
    expect(FakeRec.instances).toHaveLength(2);
  });

  it("tarayıcının kendiliğinden gönderdiği 'aborted' sessizce yutulmaz", () => {
    const { result } = renderHook(() => useSpeechRecognition({ ...opts, onText: () => {} }));
    act(() => result.current.start(""));
    inst(0).emitStart();
    inst(0).emitError("aborted");
    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe("generic");
  });

  it("unmount: zamanlayıcılar ve işleyiciler temizlenir, setState yapılmaz", async () => {
    FakeRec.engine = "hung";
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result, unmount } = renderHook(() => useSpeechRecognition({ ...opts, onText: () => {} }));
    act(() => result.current.start(""));
    unmount();
    expect(inst(0).aborted).toBe(1);
    expect(inst(0).onend).toBeNull();
    expect(inst(0).onresult).toBeNull();
    await wait(120); // eski zamanlayıcılar tetiklenmez / uyarı yok
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });
});
