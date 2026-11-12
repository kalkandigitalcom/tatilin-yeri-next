/* ===============================================================
   🧪 useSpeechRecognition — ZAMANLAYICILAR VE YEDEK KAPANIŞ
   ===============================================================
   • `onend` hiç gelmezse (bazı mobil tarayıcılar) yedek zamanlayıcı
     oturumu kapatır; yeni oturum açılabilir (takılı kalmaz).
   • En uzun dinleme süresi dolunca stop() çağrılır.
   • Desteklenmeyen tarayıcıda status = "unsupported".
   =============================================================== */
import { describe, it, expect, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useSpeechRecognition } from "@/app/components/ui/hero/_hooks/useSpeechRecognition";

class Fake {
  static instances: Fake[] = [];
  lang = "";
  continuous = true;
  interimResults = false;
  maxAlternatives = 0;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onresult: ((e: unknown) => void) | null = null;
  onnomatch: (() => void) | null = null;
  onspeechstart: (() => void) | null = null;
  onspeechend: (() => void) | null = null;
  stopped = 0;
  aborted = 0;
  constructor() {
    Fake.instances.push(this);
  }
  start() {}
  stop() {
    this.stopped++;
  }
  abort() {
    this.aborted++;
  }
}

const w = window as unknown as Record<string, unknown>;
afterEach(() => {
  delete w.webkitSpeechRecognition;
  Fake.instances = [];
});
const wait = (ms: number) => act(() => new Promise((r) => setTimeout(r, ms)));

describe("useSpeechRecognition", () => {
  it("destek yoksa unsupported", () => {
    const { result } = renderHook(() =>
      useSpeechRecognition({ lang: "tr-TR", enabled: true, maxLength: 300, onText: () => {} })
    );
    expect(result.current.status).toBe("unsupported");
    expect(result.current.supported).toBe(false);
  });

  it("onend gelmezse yedek zamanlayıcı oturumu kapatır; yeni oturum açılabilir", async () => {
    w.webkitSpeechRecognition = Fake;
    const texts: string[] = [];
    const { result } = renderHook(() =>
      useSpeechRecognition({ lang: "tr-TR", enabled: true, maxLength: 300, onText: (t) => texts.push(t), endGraceMs: 30 })
    );
    act(() => result.current.start("Kalkan"));
    act(() => Fake.instances[0].onstart?.());
    expect(result.current.status).toBe("listening");
    act(() => result.current.cancel());
    expect(result.current.active).toBe(true); // onend bekleniyor
    await wait(60);
    expect(result.current.status).toBe("idle");
    expect(texts[texts.length - 1]).toBe("Kalkan");
    act(() => result.current.start("Kalkan"));
    expect(Fake.instances).toHaveLength(2);
  });

  it("en uzun dinleme süresi dolunca stop() çağrılır", async () => {
    w.webkitSpeechRecognition = Fake;
    const { result } = renderHook(() =>
      useSpeechRecognition({ lang: "de-DE", enabled: true, maxLength: 300, onText: () => {}, maxDurationMs: 30, endGraceMs: 30 })
    );
    act(() => result.current.start(""));
    await wait(50);
    expect(Fake.instances[0].stopped).toBe(1);
    await wait(50);
    expect(result.current.active).toBe(false);
  });

  it("enabled=false olunca açık oturum iptal edilir", () => {
    w.webkitSpeechRecognition = Fake;
    const { result, rerender } = renderHook(
      ({ enabled }) => useSpeechRecognition({ lang: "en-GB", enabled, maxLength: 300, onText: () => {} }),
      { initialProps: { enabled: true } }
    );
    act(() => result.current.start(""));
    rerender({ enabled: false });
    expect(Fake.instances[0].aborted).toBe(1);
  });
});
