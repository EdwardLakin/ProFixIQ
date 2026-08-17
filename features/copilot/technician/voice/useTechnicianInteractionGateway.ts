"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  useTechnicianRealtimeVoice,
  type TechnicianRealtimeVoiceState,
} from "./useTechnicianRealtimeVoice";

export type TechnicianVoicePhase =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "error";

export type TechnicianVoiceTurnResult = {
  reply?: string | null;
};

type TechnicianInteractionGatewayOptions = {
  enabled: boolean;
  autoStart?: boolean;
  onUtterance: (text: string) => Promise<TechnicianVoiceTurnResult>;
};

type RealtimeTransport = {
  start: () => Promise<void>;
  pause?: () => boolean;
  playAudio?: (encodedAudio: ArrayBuffer) => Promise<void>;
  stopAudio?: () => void;
  resume?: () => boolean;
  stop: () => void;
};

type ScreenWakeLockSentinel = {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (
    type: "release",
    listener: () => void,
    options?: AddEventListenerOptions,
  ) => void;
};

type NavigatorWithWakeLock = Navigator & {
  wakeLock?: {
    request: (type: "screen") => Promise<ScreenWakeLockSentinel>;
  };
};

const COPILOT_SPEECH_TIMEOUT_MS = 20_000;

function normalizedTranscript(text: string): string | null {
  const value = text.trim();
  return value || null;
}

function speechWatchdogDelay(text: string): number {
  const wordCount = Math.max(1, text.trim().split(/\s+/).length);
  // A validated reply may contain 2,000 characters. Slow mobile voices can
  // legitimately need several minutes for that much text, so the completion
  // watchdog scales with both words and characters instead of truncating at a
  // fixed 90-second ceiling.
  return Math.max(
    10_000,
    wordCount * 750 + 6_000,
    text.trim().length * 150 + 6_000,
  );
}

function isRecoverableTurnFailure(caught: unknown): boolean {
  if (caught && typeof caught === "object" && "recoverable" in caught) {
    const marker = (caught as { recoverable?: unknown }).recoverable;
    if (typeof marker === "boolean") return marker;
  }
  if (
    typeof DOMException !== "undefined" &&
    caught instanceof DOMException &&
    caught.name === "AbortError"
  ) {
    return true;
  }
  if (caught instanceof TypeError) return true;

  const message = caught instanceof Error ? caught.message : "";
  return /took too long|network|connection was interrupted|temporar|try again/i.test(
    message,
  );
}

export function useTechnicianInteractionGateway({
  enabled,
  autoStart = false,
  onUtterance,
}: TechnicianInteractionGatewayOptions) {
  const [phase, setPhase] = useState<TechnicianVoicePhase>("idle");
  const [modeActive, setModeActive] = useState(false);
  const [heardTranscript, setHeardTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [wakeLockSupported, setWakeLockSupported] = useState(false);

  const activeRef = useRef(false);
  const autoStartAttemptedRef = useRef(false);
  const phaseRef = useRef<TechnicianVoicePhase>("idle");
  const generationRef = useRef(0);
  const inFlightRef = useRef(false);
  const transportStartedRef = useRef(false);
  const onUtteranceRef = useRef(onUtterance);
  const realtimeRef = useRef<RealtimeTransport | null>(null);
  const startListeningRef = useRef<() => Promise<void>>(async () => undefined);
  const speakReplyRef = useRef<(text: string) => void>(() => undefined);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const speechWatchdogRef = useRef<number | null>(null);
  const speechStartWatchdogRef = useRef<number | null>(null);
  const speechRequestControllerRef = useRef<AbortController | null>(null);
  const speechPlaybackAttemptRef = useRef(0);
  const wakeLockRef = useRef<ScreenWakeLockSentinel | null>(null);
  const wakeLockRequestPendingRef = useRef(false);

  const setVoicePhase = useCallback((next: TechnicianVoicePhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  useEffect(() => {
    onUtteranceRef.current = onUtterance;
  }, [onUtterance]);

  const clearSpeechWatchdog = useCallback(() => {
    if (speechWatchdogRef.current !== null) {
      window.clearTimeout(speechWatchdogRef.current);
      speechWatchdogRef.current = null;
    }
    if (speechStartWatchdogRef.current !== null) {
      window.clearTimeout(speechStartWatchdogRef.current);
      speechStartWatchdogRef.current = null;
    }
  }, []);

  const cancelSpeechOutput = useCallback(() => {
    speechPlaybackAttemptRef.current += 1;
    speechRequestControllerRef.current?.abort();
    speechRequestControllerRef.current = null;
    try {
      realtimeRef.current?.stopAudio?.();
    } catch {}
  }, []);

  const releaseWakeLock = useCallback(() => {
    const wakeLock = wakeLockRef.current;
    wakeLockRef.current = null;
    setWakeLockActive(false);
    if (wakeLock && !wakeLock.released) {
      void wakeLock.release().catch(() => undefined);
    }
  }, []);

  const requestWakeLock = useCallback(async () => {
    if (
      typeof navigator === "undefined" ||
      typeof document === "undefined" ||
      document.visibilityState !== "visible" ||
      !activeRef.current ||
      wakeLockRef.current ||
      wakeLockRequestPendingRef.current
    ) {
      return;
    }

    const wakeLockManager = (navigator as NavigatorWithWakeLock).wakeLock;
    setWakeLockSupported(Boolean(wakeLockManager));
    if (!wakeLockManager) return;

    wakeLockRequestPendingRef.current = true;
    try {
      const sentinel = await wakeLockManager.request("screen");
      if (!activeRef.current || document.visibilityState !== "visible") {
        await sentinel.release().catch(() => undefined);
        return;
      }

      wakeLockRef.current = sentinel;
      setWakeLockActive(true);
      sentinel.addEventListener(
        "release",
        () => {
          if (wakeLockRef.current === sentinel) {
            wakeLockRef.current = null;
            setWakeLockActive(false);
          }
        },
        { once: true },
      );
    } catch {
      setWakeLockActive(false);
    } finally {
      wakeLockRequestPendingRef.current = false;
    }
  }, []);

  const invalidateGeneration = useCallback(() => {
    generationRef.current += 1;
    inFlightRef.current = false;
    cancelSpeechOutput();
    clearSpeechWatchdog();
  }, [cancelSpeechOutput, clearSpeechWatchdog]);

  const handleTransportState = useCallback(
    (state: TechnicianRealtimeVoiceState) => {
      if (!activeRef.current) {
        setVoicePhase("idle");
        return;
      }

      if (state === "idle") {
        transportStartedRef.current = false;

        if (
          phaseRef.current === "thinking" ||
          phaseRef.current === "speaking"
        ) {
          return;
        }

        invalidateGeneration();
        activeRef.current = false;
        setModeActive(false);
        releaseWakeLock();
        setVoicePhase("idle");
        setError("Voice connection ended. Start voice to reconnect.");
        return;
      }

      if (phaseRef.current === "thinking" || phaseRef.current === "speaking") {
        return;
      }
      if (state === "connecting") setVoicePhase("connecting");
      else if (state === "listening") setVoicePhase("listening");
      else if (state === "error") setVoicePhase("error");
    },
    [invalidateGeneration, releaseWakeLock, setVoicePhase],
  );

  const handleFinalTranscript = useCallback(
    (rawText: string) => {
      const text = normalizedTranscript(rawText);
      if (
        !text ||
        !activeRef.current ||
        inFlightRef.current ||
        phaseRef.current !== "listening"
      ) {
        return;
      }
      const generation = generationRef.current;

      void (async () => {
        inFlightRef.current = true;
        setHeardTranscript(text);
        setVoicePhase("thinking");
        const paused = realtimeRef.current?.pause?.() ?? false;
        if (!paused) {
          realtimeRef.current?.stop();
          transportStartedRef.current = false;
        }
        setError(null);

        try {
          const result = await onUtteranceRef.current(text);
          if (
            !activeRef.current ||
            generationRef.current !== generation
          ) {
            return;
          }
          const reply = normalizedTranscript(result.reply ?? "");
          if (reply) {
            speakReplyRef.current(reply);
          } else {
            await startListeningRef.current();
          }
        } catch (caught) {
          if (
            !activeRef.current ||
            generationRef.current !== generation
          ) {
            return;
          }
          const failureMessage =
            caught instanceof Error
              ? caught.message
              : "Technician CoPilot could not process that voice turn.";
          setError(failureMessage);
          if (isRecoverableTurnFailure(caught)) {
            await startListeningRef.current();
          } else {
            // Authorization, stale-session, capability, and configuration
            // failures require user action. Stop the microphone instead of
            // resubmitting every subsequent transcript into a terminal state.
            invalidateGeneration();
            activeRef.current = false;
            setModeActive(false);
            releaseWakeLock();
            transportStartedRef.current = false;
            try {
              realtimeRef.current?.stop();
            } catch {}
            setVoicePhase("error");
          }
        } finally {
          if (generationRef.current === generation) {
            inFlightRef.current = false;
          }
        }
      })();
    },
    [invalidateGeneration, releaseWakeLock, setVoicePhase],
  );

  const realtime = useTechnicianRealtimeVoice(
    handleFinalTranscript,
    (text) => normalizedTranscript(text),
    {
      onStateChange: handleTransportState,
      onError: (message) => {
        if (!activeRef.current) return;
        transportStartedRef.current = false;
        invalidateGeneration();
        activeRef.current = false;
        setModeActive(false);
        releaseWakeLock();
        setVoicePhase("error");
        setError(message);
      },
    },
  );
  realtimeRef.current = realtime;

  const startListening = useCallback(async () => {
    if (!enabled || !activeRef.current) return;
    const generation = generationRef.current;
    setHeardTranscript("");
    setVoicePhase("connecting");
    try {
      if (
        transportStartedRef.current &&
        realtimeRef.current?.resume?.()
      ) {
        return;
      }

      await realtimeRef.current?.start();

      // The transport owns resources per startup generation. If this gateway
      // generation was replaced while start() awaited token/mic permission,
      // simply ignore its completion. Calling the shared stop() here could tear
      // down the newer transport that now belongs to the restarted voice mode.
      if (!activeRef.current || generationRef.current !== generation) return;
      transportStartedRef.current = true;
    } catch (caught) {
      if (!activeRef.current || generationRef.current !== generation) return;

      // A current startup failure has already reset its transport resources so
      // future start() calls can retry. The gateway only resets its own UI mode.
      transportStartedRef.current = false;
      invalidateGeneration();
      activeRef.current = false;
      setModeActive(false);
      releaseWakeLock();
      setVoicePhase("error");
      setError(
        caught instanceof Error ? caught.message : "Realtime voice could not start.",
      );
    }
  }, [enabled, invalidateGeneration, releaseWakeLock, setVoicePhase]);
  startListeningRef.current = startListening;

  const speakWithDeviceVoice = useCallback(
    (text: string, generation: number, playbackAttempt: number) => {
      if (
        !activeRef.current ||
        generationRef.current !== generation ||
        speechPlaybackAttemptRef.current !== playbackAttempt
      ) {
        return;
      }
      if (
        typeof window === "undefined" ||
        typeof window.speechSynthesis === "undefined" ||
        typeof SpeechSynthesisUtterance === "undefined"
      ) {
        setError(
          "Spoken reply could not play. The reply is shown here and voice is listening again.",
        );
        void startListeningRef.current();
        return;
      }

      const speechSynthesis = window.speechSynthesis;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";
      utterance.rate = 1;
      utteranceRef.current = utterance;
      setVoicePhase("speaking");

      const resume = () => {
        if (
          utteranceRef.current !== utterance ||
          !activeRef.current ||
          generationRef.current !== generation ||
          speechPlaybackAttemptRef.current !== playbackAttempt
        ) {
          return;
        }
        clearSpeechWatchdog();
        utteranceRef.current = null;
        void startListeningRef.current();
      };

      utterance.onend = resume;
      utterance.onerror = () => {
        if (
          utteranceRef.current !== utterance ||
          generationRef.current !== generation ||
          speechPlaybackAttemptRef.current !== playbackAttempt
        ) {
          return;
        }
        setError("Spoken reply could not play. Continuing in listening mode.");
        resume();
      };

      clearSpeechWatchdog();
      speechWatchdogRef.current = window.setTimeout(() => {
        if (
          utteranceRef.current !== utterance ||
          !activeRef.current ||
          generationRef.current !== generation ||
          speechPlaybackAttemptRef.current !== playbackAttempt
        ) {
          return;
        }
        utteranceRef.current = null;
        speechWatchdogRef.current = null;
        try {
          speechSynthesis.cancel();
        } catch {}
        setError(
          "The spoken reply stalled. The reply is shown here and voice is listening again.",
        );
        void startListeningRef.current();
      }, speechWatchdogDelay(text));

      try {
        // WebKit can leave speech synthesis paused after route changes or an
        // interrupted utterance. Resume it and avoid cancel-then-speak, which
        // can silently strand a new utterance on iOS Safari.
        speechSynthesis.resume();
        speechSynthesis.speak(utterance);
        speechStartWatchdogRef.current = window.setTimeout(() => {
          speechStartWatchdogRef.current = null;
          if (
            utteranceRef.current !== utterance ||
            !activeRef.current ||
            generationRef.current !== generation ||
            speechPlaybackAttemptRef.current !== playbackAttempt ||
            speechSynthesis.speaking ||
            speechSynthesis.pending
          ) {
            return;
          }
          utteranceRef.current = null;
          clearSpeechWatchdog();
          setError(
            "Spoken reply could not start. The reply is shown here and voice is listening again.",
          );
          void startListeningRef.current();
        }, 1_500);
      } catch {
        clearSpeechWatchdog();
        utteranceRef.current = null;
        setError(
          "Spoken reply could not start. The reply is shown here and voice is listening again.",
        );
        void startListeningRef.current();
      }
    },
    [clearSpeechWatchdog, setVoicePhase],
  );

  const speakReply = useCallback(
    (text: string) => {
      if (!activeRef.current) return;

      const generation = generationRef.current;
      cancelSpeechOutput();
      const playbackAttempt = speechPlaybackAttemptRef.current;
      const controller = new AbortController();
      speechRequestControllerRef.current = controller;
      setVoicePhase("speaking");

      void (async () => {
        const timeout = window.setTimeout(
          () => controller.abort(),
          COPILOT_SPEECH_TIMEOUT_MS,
        );
        try {
          const response = await fetch("/api/copilot/technician/speech", {
            method: "POST",
            cache: "no-store",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
            signal: controller.signal,
          });
          if (!response.ok) {
            throw new Error("Generated CoPilot voice was unavailable.");
          }

          const encodedAudio = await response.arrayBuffer();
          if (encodedAudio.byteLength === 0) {
            throw new Error("Generated CoPilot voice returned no audio.");
          }
          if (
            !activeRef.current ||
            generationRef.current !== generation ||
            speechPlaybackAttemptRef.current !== playbackAttempt
          ) {
            return;
          }

          const playAudio = realtimeRef.current?.playAudio;
          if (!playAudio) {
            throw new Error("CoPilot audio output is not ready.");
          }
          await playAudio(encodedAudio);
          if (
            !activeRef.current ||
            generationRef.current !== generation ||
            speechPlaybackAttemptRef.current !== playbackAttempt
          ) {
            return;
          }

          if (speechRequestControllerRef.current === controller) {
            speechRequestControllerRef.current = null;
          }
          void startListeningRef.current();
        } catch {
          if (
            !activeRef.current ||
            generationRef.current !== generation ||
            speechPlaybackAttemptRef.current !== playbackAttempt
          ) {
            return;
          }
          if (speechRequestControllerRef.current === controller) {
            speechRequestControllerRef.current = null;
          }
          speakWithDeviceVoice(text, generation, playbackAttempt);
        } finally {
          window.clearTimeout(timeout);
        }
      })();
    },
    [cancelSpeechOutput, setVoicePhase, speakWithDeviceVoice],
  );
  speakReplyRef.current = speakReply;

  const start = useCallback(async () => {
    if (!enabled || activeRef.current) return;
    invalidateGeneration();
    utteranceRef.current = null;
    activeRef.current = true;
    setModeActive(true);
    setError(null);
    void requestWakeLock();
    await startListeningRef.current();
  }, [enabled, invalidateGeneration, requestWakeLock]);

  useEffect(() => {
    if (!enabled || !autoStart || autoStartAttemptedRef.current) return;
    autoStartAttemptedRef.current = true;
    void start();
  }, [autoStart, enabled, start]);

  const stop = useCallback(() => {
    invalidateGeneration();
    activeRef.current = false;
    setModeActive(false);
    setHeardTranscript("");
    releaseWakeLock();
    try {
      realtimeRef.current?.stop();
    } catch {}
    transportStartedRef.current = false;
    if (typeof window !== "undefined") {
      window.speechSynthesis?.cancel();
    }
    clearSpeechWatchdog();
    utteranceRef.current = null;
    setVoicePhase("idle");
  }, [clearSpeechWatchdog, invalidateGeneration, releaseWakeLock, setVoicePhase]);

  const interrupt = useCallback(() => {
    if (!activeRef.current || phaseRef.current !== "speaking") return;
    cancelSpeechOutput();
    utteranceRef.current = null;
    if (typeof window !== "undefined") {
      window.speechSynthesis?.cancel();
    }
    clearSpeechWatchdog();
    void startListeningRef.current();
  }, [cancelSpeechOutput, clearSpeechWatchdog]);

  useEffect(() => {
    if (typeof navigator === "undefined" || typeof document === "undefined") {
      return;
    }

    setWakeLockSupported(Boolean((navigator as NavigatorWithWakeLock).wakeLock));
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && activeRef.current) {
        void requestWakeLock();
      } else if (document.visibilityState !== "visible") {
        releaseWakeLock();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [releaseWakeLock, requestWakeLock]);

  useEffect(() => {
    if (!enabled && activeRef.current) {
      stop();
    }
  }, [enabled, stop]);

  useEffect(() => stop, [stop]);

  return {
    phase,
    active: modeActive,
    heardTranscript,
    error,
    wakeLockActive,
    wakeLockSupported,
    start,
    stop,
    interrupt,
  };
}
