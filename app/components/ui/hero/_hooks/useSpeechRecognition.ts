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

   Durumlar:
     idle → starting → listening → stopping → done | error
     (unsupported: tarayıcıda API yok / güvenli bağlam değil)

   Metin kuralları:
     • Oturum başında alandaki metin `base` olarak saklanır; ASLA silinmez.
     • Konuşma `base`'in sonuna tek boşlukla eklenir (anlık, ara sonuçlar
       dahil). Her yeni oturumun `base`'i bir önceki oturumun sonucudur →
       art arda konuşmalar uç uca eklenir.
     • stop() / doğal bitiş → kesin + son ara metin kalır.
     • cancel() / hata / sekme değişimi / arka plan → yalnız O OTURUMUN
       kesinleşmiş metni kalır, tamamlanmamış (ara) metni geri alınır.
     • detach() (kullanıcı yazmaya başladı / Villa Bul) → alana artık
       dokunulmaz; kullanıcının o anki metni geçerlidir.

   ── TEKRAR DİNLEME DÜZELTMESİ (kök neden) ──────────────────────────
   Önceki sürüm oturumun kapanmasını yalnız tarayıcının `onend`
   olayına bırakıyordu. Gerçek tarayıcılarda bu olay güvenilir değil:
     • iOS Safari'de (ve askıda kalan Chromium oturumlarında) kullanıcı
       sustuktan sonra `onend` gelmeyebiliyor; oturum "dinleniyor"da
       kalıyor, sonraki dokunuş YENİ oturum yerine "durdur" sayılıyordu.
     • `onerror` sonrası `onend` gelmezse kilit 20+ sn sürüyordu.
     • Yedek kapanış yerel tanıyıcıyı `abort()` etmeden bırakıyordu.
     • Kapanış sırasında (görünmeyen "closing" hâli) dokunuşlar sessizce
       yok sayılıyordu.
   Düzeltme: oturum kapanışı artık bu hook'un kontrolünde:
     • Sessizlik bekçisi: son sonuçtan `silenceMs` sonra stop().
     • Konuşma yok bekçisi: başlangıçtan/onstart'tan sonra hiç ses/sonuç
       yoksa stop() → "duyamadık".
     • stop()/abort()/onerror sonrası `onend` beklenir; gelmezse kısa süre
       içinde yerel tanıyıcı abort() edilir ve oturum ZORLA kapatılır.
     • Kapanış sürerken buton "stopping" durumunu gösterir (≤ ~1,2 sn).
     • Sayfa görünür olduğunda takılı kalmış oturum hemen kapatılır.
     • Her oturum yeni tanıyıcı örneğiyle başlar; eski oturumun geç gelen
       olayları oturum kimliğiyle (id) yok sayılır, işleyicileri null'lanır.
     • Tarayıcının kendiliğinden gönderdiği "aborted" hatası artık sessizce
       yutulmaz (yalnız bizim istediğimiz iptal sessizdir).
   =============================================================== */

export type VoiceStatus = "unsupported" | "idle" | "starting" | "listening" | "stopping" | "done" | "error";

type EndMode = "keep" | "final-only" | "detach";
type Phase = "starting" | "listening" | "closing";

type Session = {
  id: number;
  rec: SpeechRecognitionLike;
  phase: Phase;
  /** start() zamanı (ms) — çift dokunuş koruması için. */
  startedAt: number;
  /** Bitiş kipi + sessiz (mesajsız) kapanış. */
  setMode: (m: EndMode, silent?: boolean) => void;
  /** stop()/abort() isteği (tek kez) + `onend` gelmezse zorla kapanış. */
  close: (how: "stop" | "abort") => void;
  /** Hemen kapat (yerel tanıyıcı abort edilir). */
  forceFinish: () => void;
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
  /** Son sonuçtan sonra bu kadar sessizlik → oturum biter (ms). */
  silenceMs?: number;
  /** onstart sonrası hiç ses/sonuç yoksa → "duyamadık" (ms). */
  noSpeechMs?: number;
  /** start() sonrası onstart hiç gelmezse → kapat (ms). */
  startTimeoutMs?: number;
  /** stop()/abort() sonrası `onend` beklenecek en uzun süre (ms). */
  endGraceMs?: number;
  /** onerror sonrası `onend` beklenecek en uzun süre (ms). */
  errorGraceMs?: number;
};

/** Bu süre içindeki ikinci dokunuş "çift dokunuş" sayılır, yok sayılır. */
const DOUBLE_TAP_MS = 600;

const subscribeNoop = () => () => {};
const clientSupported = () => getSpeechRecognitionCtor() !== null;
const serverSupported = () => false;

export function useSpeechRecognition({
  lang,
  enabled,
  maxLength,
  onText,
  maxDurationMs = 20000,
  silenceMs = 2000,
  noSpeechMs = 8000,
  startTimeoutMs = 12000,
  endGraceMs = 1200,
  errorGraceMs = 800,
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
      if (sessionRef.current) return; // tek oturum: önceki oturum TAMAMEN kapanmadan yeni oturum yok
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
      let requested: "stop" | "abort" | null = null; // bizim istediğimiz kapanış
      let closed = false;

      /* Zamanlayıcılar — hepsi `release()` ile temizlenir. */
      const timers = new Map<string, ReturnType<typeof setTimeout>>();
      const setTimer = (key: string, ms: number, fn: () => void) => {
        const prev = timers.get(key);
        if (prev) clearTimeout(prev);
        timers.set(key, setTimeout(fn, ms));
      };
      const clearTimer = (key: string) => {
        const t = timers.get(key);
        if (t) clearTimeout(t);
        timers.delete(key);
      };

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
        for (const t of timers.values()) clearTimeout(t);
        timers.clear();
      };

      const isCurrent = () => !closed && sessionRef.current?.id === id;

      /** Oturumu kapatır, kilidi açar, metni ve durumu sonuçlandırır. */
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
        const heard = (mode === "keep" ? `${finalText} ${interimText}` : finalText).trim();
        if (!heard) safeSet("error", "no-speech");
        else safeSet("done");
      };

      /** `onend` gelmese bile: yerel tanıyıcıyı durdur ve hemen bitir. */
      const forceFinish = () => {
        if (closed) return;
        rec.onend = null; // geç gelecek onend artık bu oturuma dokunmaz
        if (requested !== "abort") {
          requested = "abort";
          try {
            rec.abort(); // yerel tanıyıcı mikrofonu bırakmalı
          } catch {
            /* zaten kapalı */
          }
        }
        finish();
      };

      /** Kapanış isteği (tek kez); `onend` bekleme süresi dolarsa zorla kapat. */
      const close = (how: "stop" | "abort") => {
        if (closed) return;
        const s = sessionRef.current;
        if (s?.id === id) s.phase = "closing";
        if (requested === null || (requested === "stop" && how === "abort")) {
          requested = how;
          clearTimer("silence");
          clearTimer("noSpeech");
          clearTimer("startTimeout");
          clearTimer("max");
          try {
            if (how === "stop") rec.stop();
            else rec.abort();
          } catch {
            forceFinish();
            return;
          }
        }
        if (closed) return; // bazı motorlar onend'i stop()/abort() içinde eşzamanlı gönderir
        if (mountedRef.current) safeSet("stopping");
        setTimer("grace", endGraceMs, forceFinish);
      };

      const setMode = (m: EndMode, quiet = false) => {
        mode = m;
        silent = silent || quiet;
      };

      /** Ses/sonuç geldikçe "konuşma yok" bekçisi kapanır, sessizlik bekçisi yenilenir. */
      const onActivity = (withResult: boolean) => {
        clearTimer("noSpeech");
        if (withResult) setTimer("silence", silenceMs, () => isCurrent() && close("stop"));
      };

      rec.onstart = () => {
        if (!isCurrent()) return;
        clearTimer("startTimeout");
        const s = sessionRef.current;
        if (s && s.phase === "starting") {
          s.phase = "listening";
          safeSet("listening");
        }
        setTimer("noSpeech", noSpeechMs, () => {
          if (!isCurrent()) return;
          if (!pendingError) pendingError = "no-speech";
          close("stop");
        });
      };
      rec.onspeechstart = () => {
        if (!isCurrent()) return;
        onActivity(false);
        if (mountedRef.current) setSpeaking(true);
      };
      rec.onspeechend = () => {
        if (isCurrent() && mountedRef.current) setSpeaking(false);
      };
      rec.onresult = (e) => {
        if (!isCurrent()) return;
        const r = readResults(e);
        finalText = r.final;
        interimText = r.interim;
        onActivity(true);
        if (mode !== "detach") onTextRef.current(mergeVoiceText(base, `${finalText} ${interimText}`, maxLength));
      };
      rec.onnomatch = () => {
        if (isCurrent() && !pendingError) pendingError = "no-speech";
      };
      rec.onerror = (e) => {
        if (!isCurrent()) return;
        /* Bizim istediğimiz kapanışın (stop/abort) "aborted" hatası sessizdir
           (iOS stop() sonrası da "aborted" gönderebiliyor); tarayıcının
           KENDİLİĞİNDEN gönderdiği "aborted" ise genel hata olarak gösterilir. */
        const kind = e.error === "aborted" && requested === null ? "generic" : mapSpeechError(e.error);
        if (kind && !pendingError) pendingError = kind;
        if (mode === "keep" && kind) mode = "final-only"; // hata: ara metin geri alınır
        setTimer("grace", errorGraceMs, forceFinish); // onend gelmezse de kilit açılır
      };
      rec.onend = () => {
        if (closed) return;
        finish();
      };

      sessionRef.current = { id, rec, phase: "starting", startedAt: Date.now(), setMode, close, forceFinish };
      safeSet("starting");
      try {
        rec.start(); // mikrofon izni YALNIZ burada, kullanıcı tıklamasıyla istenir
      } catch {
        pendingError = "generic";
        forceFinish();
        return;
      }
      setTimer("startTimeout", startTimeoutMs, () => {
        if (!isCurrent()) return;
        if (!pendingError) pendingError = "generic";
        mode = "final-only";
        close("abort");
      });
      setTimer("max", maxDurationMs, () => isCurrent() && close("stop"));
    },
    [lang, maxLength, maxDurationMs, silenceMs, noSpeechMs, startTimeoutMs, endGraceMs, errorGraceMs, safeSet]
  );

  /** Kullanıcı "dinlemeyi bitir": konuşulan metin alanda kalır. */
  const stop = useCallback(() => {
    const s = sessionRef.current;
    if (!s) return;
    s.setMode("keep");
    s.close("stop");
  }, []);
  /** Kullanıcı iptal / sekme değişimi / arka plan: tamamlanmamış metin eklenmez. */
  const cancel = useCallback(() => {
    const s = sessionRef.current;
    if (!s) return;
    s.setMode("final-only", true);
    s.close("abort");
  }, []);
  /** Kullanıcı yazmaya başladı ya da Villa Bul'a bastı: alana artık dokunma. */
  const detach = useCallback(() => {
    const s = sessionRef.current;
    if (s) {
      s.setMode("detach", true);
      s.close("abort");
    } else safeSet("idle");
  }, [safeSet]);
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
      if (s) {
        s.setMode("final-only", true);
        s.close("abort");
      }
    };
  }, [lang]);

  /* Sayfa arka plana alındı → iptal (mikrofon açık kalmasın). Geri
     gelindiğinde takılı kalmış (kapanmakta olan) oturum hemen kapatılır;
     arka planda zamanlayıcılar kısılmış olabilir. */
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibility = () => {
      const s = sessionRef.current;
      if (!s) return;
      if (document.visibilityState === "hidden") {
        s.setMode("final-only", true);
        s.close("abort");
      } else if (s.phase === "closing") {
        s.forceFinish();
      }
    };
    const onPageHide = () => {
      const s = sessionRef.current;
      if (!s) return;
      s.setMode("final-only", true);
      s.close("abort");
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, []);

  /* Unmount → sessiz abort, işleyiciler ve zamanlayıcılar temizlenir, setState yok. */
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const s = sessionRef.current;
      if (s) {
        s.setMode("detach", true);
        s.forceFinish();
      }
    };
  }, []);

  const status: VoiceStatus = supported ? state.status : "unsupported";
  const active = state.status === "starting" || state.status === "listening" || state.status === "stopping";

  /** Mikrofon butonu:
   *   • oturum yok → başlat
   *   • dinleniyor → durdur (konuşulan metin kalır)
   *   • başlatılıyor (tarayıcı henüz onstart göndermedi):
   *       – ilk 600 ms içinde → yok say (çift dokunuş ikinci oturum açmaz)
   *       – daha sonra → takılmış başlatmayı iptal et (yerel tanıyıcı
   *         abort edilir, kilit HEMEN açılır); sonraki dokunuş yeni oturum
   *   • kapanıyor → yok say (≤ endGraceMs sonra kilit açılır) */
  const toggle = useCallback(
    (currentText: string) => {
      const s = sessionRef.current;
      if (!s) start(currentText);
      else if (s.phase === "listening") stop();
      else if (s.phase === "starting" && Date.now() - s.startedAt >= DOUBLE_TAP_MS) {
        s.setMode("final-only", true);
        s.forceFinish();
      }
    },
    [start, stop]
  );

  return { supported, status, error: state.error, speaking, active, start, stop, cancel, detach, reset, toggle };
}
