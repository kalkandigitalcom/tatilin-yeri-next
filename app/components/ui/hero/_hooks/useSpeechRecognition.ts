"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  getSpeechRecognitionCtor,
  mapSpeechError,
  mergeVoiceText,
  readResults,
  type SpeechRecognitionLike,
  type VoiceErrorKind,
} from "../_helpers/speech-recognition";

/* ===============================================================
   🎙️ useSpeechRecognition — SESLİ ARAMA OTURUM YÖNETİMİ
   ===============================================================
   Tek görevi: tarayıcının konuşma tanımasından gelen metni, çağıranın
   verdiği `onText` ile METİN ALANINA yazmak. Arama başlatmaz, parser
   çağırmaz, URL kurmaz, sunucuya bir şey göndermez.

   Durumlar: idle → starting → listening → done | error  (unsupported:
   tarayıcıda API yok / güvenli bağlam değil).

   Metin kuralları:
     • Oturum başında alandaki metin `base` olarak saklanır; ASLA silinmez.
     • Konuşma `base`'in sonuna tek boşlukla eklenir (anlık, ara sonuçlar
       dahil).
     • stop() / doğal bitiş → kesin + son ara metin kalır.
     • cancel() / hata / sekme değişimi / arka plan → yalnız KESİNLEŞMİŞ
       konuşma kalır, tamamlanmamış (ara) metin geri alınır.
     • detach() (kullanıcı yazmaya başladı / Villa Bul) → alana artık
       dokunulmaz; kullanıcının o anki metni geçerlidir.

   Yaşam döngüsü:
     • Aynı anda tek oturum: `sessionRef` + oturum kapanış bayrağı; hızlı
       tekrar tıklamalar ikinci oturum açmaz.
     • Her oturum yeni bir tanıyıcı örneği oluşturur; bitişte tüm olay
       işleyicileri null'lanır (eski olay sızıntısı yok).
     • `onend` gelmezse (bazı mobil tarayıcılar) yedek zamanlayıcı oturumu
       kapatır. En uzun oturum süresi sınırlıdır.
     • enabled=false (sekme değişti), dil değişti, sayfa gizlendi
       (visibilitychange / pagehide) → cancel(). Unmount → sessiz abort.
   =============================================================== */

export type VoiceStatus = "unsupported" | "idle" | "starting" | "listening" | "done" | "error";

type EndMode = "keep" | "final-only" | "detach";

type Session = {
  id: number;
  rec: SpeechRecognitionLike;
  /** stop/abort çağrıldı; ikinci kez çağrılmaz. */
  closing: boolean;
  setMode: (m: EndMode, silent?: boolean) => void;
  finish: () => void;
};

export type UseSpeechRecognitionOptions = {
  /** BCP-47 konuşma dili (ör. "tr-TR"). */
  lang: string;
  /** Panel görünür mü — false olunca açık oturum iptal edilir. */
  enabled: boolean;
  /** Metin alanının üst sınırı. */
  maxLength: number;
  /** Metin alanına yazılacak TAM metin (base + konuşma). */
  onText: (text: string) => void;
  /** En uzun dinleme süresi (ms). */
  maxDurationMs?: number;
  /** stop()/abort() sonrası `onend` beklenecek en uzun süre (ms). */
  endGraceMs?: number;
};

const subscribeNoop = () => () => {};
const clientSupported = () => getSpeechRecognitionCtor() !== null;
const serverSupported = () => false;

export function useSpeechRecognition({
  lang,
  enabled,
  maxLength,
  onText,
  maxDurationMs = 20000,
  endGraceMs = 2500,
}: UseSpeechRecognitionOptions) {
  /* SSR'de false; istemcide gerçek destek (hydration uyumlu). */
  const supported = useSyncExternalStore(subscribeNoop, clientSupported, serverSupported);
  const [state, setState] = useState<{ status: Exclude<VoiceStatus, "unsupported">; error: VoiceErrorKind | null }>({
    status: "idle",
    error: null,
  });
  const [speaking, setSpeaking] = useState(false);

  const sessionRef = useRef<Session | null>(null);
  const seqRef = useRef(0);
  const mountedRef = useRef(true);
  const onTextRef = useRef(onText);
  useEffect(() => {
    onTextRef.current = onText;
  }, [onText]);

  const safeSet = useCallback((status: Exclude<VoiceStatus, "unsupported">, error: VoiceErrorKind | null = null) => {
    if (mountedRef.current) setState({ status, error });
  }, []);

  const start = useCallback(
    (currentText: string) => {
      if (sessionRef.current) return; // tek oturum
      const Ctor = getSpeechRecognitionCtor();
      if (!Ctor) {
        safeSet("error", "unsupported");
        return;
      }
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        safeSet("error", "network"); // mikrofon izni hiç istenmez
        return;
      }

      const id = ++seqRef.current;
      const base = currentText;
      let finalText = "";
      let interimText = "";
      let mode: EndMode = "keep";
      let silent = false;
      let pendingError: VoiceErrorKind | null = null;
      let closed = false;
      let maxTimer: ReturnType<typeof setTimeout> | null = null;
      let graceTimer: ReturnType<typeof setTimeout> | null = null;

      const rec = new Ctor();
      rec.lang = lang;
      rec.continuous = false; // kısa arama cümlesi; iOS'ta en öngörülebilir mod
      rec.interimResults = true; // anlık metin
      rec.maxAlternatives = 1;

      const release = () => {
        rec.onstart = null;
        rec.onend = null;
        rec.onerror = null;
        rec.onresult = null;
        rec.onnomatch = null;
        rec.onspeechstart = null;
        rec.onspeechend = null;
        if (maxTimer) clearTimeout(maxTimer);
        if (graceTimer) clearTimeout(graceTimer);
        maxTimer = graceTimer = null;
      };

      const finish = () => {
        if (closed) return;
        closed = true;
        release();
        if (sessionRef.current?.id === id) sessionRef.current = null;
        if (!mountedRef.current) return;
        setSpeaking(false);
        if (mode !== "detach") {
          const spoken = mode === "keep" ? `${finalText} ${interimText}` : finalText;
          onTextRef.current(mergeVoiceText(base, spoken, maxLength));
        }
        if (silent) {
          safeSet("idle");
          return;
        }
        if (pendingError) {
          safeSet("error", pendingError);
          return;
        }
        const heard = `${finalText} ${interimText}`.trim();
        if (mode === "keep" && !heard) safeSet("error", "no-speech");
        else safeSet("done");
      };

      const setMode = (m: EndMode, quiet = false) => {
        mode = m;
        silent = silent || quiet;
      };

      const isCurrent = () => !closed && sessionRef.current?.id === id;

      rec.onstart = () => {
        if (isCurrent()) safeSet("listening");
      };
      rec.onspeechstart = () => {
        if (isCurrent() && mountedRef.current) setSpeaking(true);
      };
      rec.onspeechend = () => {
        if (isCurrent() && mountedRef.current) setSpeaking(false);
      };
      rec.onresult = (e) => {
        if (!isCurrent()) return;
        const r = readResults(e);
        finalText = r.final;
        interimText = r.interim;
        if (mode !== "detach") onTextRef.current(mergeVoiceText(base, `${finalText} ${interimText}`, maxLength));
      };
      rec.onnomatch = () => {
        if (isCurrent() && !pendingError) pendingError = "no-speech";
      };
      rec.onerror = (e) => {
        if (!isCurrent()) return;
        const kind = mapSpeechError(e.error);
        if (kind) {
          pendingError = kind;
          if (mode === "keep") mode = "final-only"; // hata: ara metin geri alınır
        }
      };
      rec.onend = () => finish();

      sessionRef.current = { id, rec, closing: false, setMode, finish };
      safeSet("starting");
      try {
        rec.start(); // mikrofon izni YALNIZ burada, kullanıcı tıklamasıyla istenir
      } catch {
        pendingError = "generic";
        mode = "detach";
        finish();
        return;
      }
      maxTimer = setTimeout(() => {
        if (!isCurrent()) return;
        try {
          rec.stop();
        } catch {
          /* yoksay */
        }
        graceTimer = setTimeout(finish, endGraceMs);
      }, maxDurationMs);
    },
    [lang, maxLength, maxDurationMs, endGraceMs, safeSet]
  );

  /** Oturumu kapat (abort/stop) ve `onend` gelmezse yedek zamanlayıcıyla bitir. */
  const end = useCallback(
    (how: "stop" | "abort", mode: EndMode, quiet = false) => {
      const s = sessionRef.current;
      if (!s) return;
      s.setMode(mode, quiet);
      if (s.closing) return; // zaten kapanıyor: yalnız bitiş kipi güncellenir
      s.closing = true;
      try {
        if (how === "stop") s.rec.stop();
        else s.rec.abort();
      } catch {
        /* yoksay */
      }
      setTimeout(() => s.finish(), endGraceMs);
    },
    [endGraceMs]
  );

  /** Kullanıcı "dinlemeyi bitir": konuşulan metin alanda kalır. */
  const stop = useCallback(() => end("stop", "keep"), [end]);
  /** Kullanıcı iptal / sekme değişimi / arka plan: tamamlanmamış metin eklenmez. */
  const cancel = useCallback(() => end("abort", "final-only", true), [end]);
  /** Kullanıcı yazmaya başladı ya da Villa Bul'a bastı: alana artık dokunma. */
  const detach = useCallback(() => {
    end("abort", "detach", true);
    if (!sessionRef.current) safeSet("idle");
  }, [end, safeSet]);
  /** "Konuşma tamamlandı" / hata mesajını temizle. */
  const reset = useCallback(() => {
    if (!sessionRef.current) safeSet("idle");
  }, [safeSet]);

  /* Panel gizlendi (Tarihle Ara sekmesi) → iptal. */
  useEffect(() => {
    if (!enabled) cancel();
  }, [enabled, cancel]);

  /* Dil değişti → açık oturum iptal; sonraki oturum yeni dille açılır. */
  useEffect(() => {
    return () => {
      const s = sessionRef.current;
      if (s && !s.closing) {
        s.setMode("final-only", true);
        s.closing = true;
        try {
          s.rec.abort();
        } catch {
          /* yoksay */
        }
        setTimeout(() => s.finish(), endGraceMs); // onend gelmezse
      }
    };
  }, [lang, endGraceMs]);

  /* Sayfa arka plana alındı / kapatılıyor → iptal (mikrofon açık kalmasın). */
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") cancel();
    };
    const onPageHide = () => cancel();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [cancel]);

  /* Unmount → sessiz abort, işleyiciler temizlenir, setState yapılmaz. */
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const s = sessionRef.current;
      if (s) {
        s.setMode("detach", true);
        if (!s.closing) {
          s.closing = true;
          try {
            s.rec.abort();
          } catch {
            /* yoksay */
          }
        }
        s.finish();
      }
    };
  }, []);

  const status: VoiceStatus = supported ? state.status : "unsupported";
  const active = state.status === "starting" || state.status === "listening";

  const toggle = useCallback(
    (currentText: string) => {
      if (sessionRef.current) stop();
      else start(currentText);
    },
    [start, stop]
  );

  return { supported, status, error: state.error, speaking, active, start, stop, cancel, detach, reset, toggle };
}
