"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  useRealtimeTranscription,
  type RealtimeTranscriptionState,
} from "@/features/shared/voice/useRealtimeTranscription";

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
  onUtterance: (text: string) => Promise<TechnicianVoiceTurnResult>;
};

function normalizedTranscript(text: string): string | null {
  const value = text.trim();
  return value || null;
}

export function useTechnicianInteractionGateway({
  enabled,
  onUtterance,
}: TechnicianInteractionGatewayOptions) {
  const [phase, setPhase] = useState<TechnicianVoicePhase>("idle");
  const [modeActive, setModeActive] = useState(false);
  const [partialTranscript, setPartialTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  const activeRef = useRef(false);
  const phaseRef = useRef<TechnicianVoicePhase>("idle");
  const inFlightRef = useRef(false);
  const onUtteranceRef = useRef(onUtterance);
  const realtimeRef = useRef<{ start: () => Promise<void>; stop: () => void } | null>(
    null,
  );
  const startListeningRef = useRef<() => Promise<void>>(async () => undefined);
  const speakReplyRef = useRef<(text: string) => void>(() => undefined);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const setVoicePhase = useCallback((next: TechnicianVoicePhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  useEffect(() => {
    onUtteranceRef.current = onUtterance;
  }, [onUtterance]);

  const handleTransportState = useCallback(
    (state: RealtimeTranscriptionState) => {
      if (!activeRef.current) {
        setVoicePhase("idle");
        return;
      }
      if (phaseRef.current === "thinking" || phaseRef.current === "speaking") {
        return;
      }
      if (state === "connecting") setVoicePhase("connecting");
      else if (state === "listening") setVoicePhase("listening");
      else if (state === "error") setVoicePhase("error");
      else setVoicePhase("idle");
    },
    [setVoicePhase],
  );

  const handleFinalTranscript = useCallback(
    (rawText: string) => {
      const text = normalizedTranscript(rawText);
      if (!text || !activeRef.current || inFlightRef.current) return;

      void (async () => {
        inFlightRef.current = true;
        setPartialTranscript("");
        realtimeRef.current?.stop();
        setVoicePhase("thinking");
        setError(null);

        try {
          const result = await onUtteranceRef.current(text);
          if (!activeRef.current) return;
          const reply = normalizedTranscript(result.reply ?? "");
          if (reply) {
            speakReplyRef.current(reply);
          } else {
            await startListeningRef.current();
          }
        } catch (caught) {
          if (!activeRef.current) return;
          activeRef.current = false;
          setModeActive(false);
          setVoicePhase("error");
          setError(
            caught instanceof Error
              ? caught.message
              : "Technician CoPilot could not process that voice turn.",
          );
        } finally {
          inFlightRef.current = false;
        }
      })();
    },
    [setVoicePhase],
  );

  const realtime = useRealtimeTranscription(
    handleFinalTranscript,
    (text) => normalizedTranscript(text),
    {
      onStateChange: handleTransportState,
      onError: (message) => {
        if (!activeRef.current) return;
        activeRef.current = false;
        setModeActive(false);
        setVoicePhase("error");
        setError(message);
      },
      onPartialTranscript: setPartialTranscript,
    },
  );
  realtimeRef.current = realtime;

  const startListening = useCallback(async () => {
    if (!enabled || !activeRef.current) return;
    setPartialTranscript("");
    setVoicePhase("connecting");
    try {
      await realtimeRef.current?.start();
    } catch (caught) {
      if (!activeRef.current) return;
      activeRef.current = false;
      setModeActive(false);
      setVoicePhase("error");
      setError(
        caught instanceof Error ? caught.message : "Realtime voice could not start.",
      );
    }
  }, [enabled, setVoicePhase]);
  startListeningRef.current = startListening;

  const speakReply = useCallback(
    (text: string) => {
      if (!activeRef.current) return;
      if (
        typeof window === "undefined" ||
        typeof window.speechSynthesis === "undefined" ||
        typeof SpeechSynthesisUtterance === "undefined"
      ) {
        void startListeningRef.current();
        return;
      }

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";
      utterance.rate = 1;
      utteranceRef.current = utterance;
      setVoicePhase("speaking");

      const resume = () => {
        if (utteranceRef.current === utterance) {
          utteranceRef.current = null;
        }
        if (activeRef.current) {
          void startListeningRef.current();
        }
      };

      utterance.onend = resume;
      utterance.onerror = () => {
        setError("Spoken reply could not play. Continuing in listening mode.");
        resume();
      };
      window.speechSynthesis.speak(utterance);
    },
    [setVoicePhase],
  );
  speakReplyRef.current = speakReply;

  const start = useCallback(async () => {
    if (!enabled || activeRef.current) return;
    if (typeof window !== "undefined") {
      window.speechSynthesis?.cancel();
    }
    activeRef.current = true;
    setModeActive(true);
    setError(null);
    await startListeningRef.current();
  }, [enabled]);

  const stop = useCallback(() => {
    activeRef.current = false;
    setModeActive(false);
    setPartialTranscript("");
    inFlightRef.current = false;
    try {
      realtimeRef.current?.stop();
    } catch {}
    if (typeof window !== "undefined") {
      window.speechSynthesis?.cancel();
    }
    utteranceRef.current = null;
    setVoicePhase("idle");
  }, [setVoicePhase]);

  const interrupt = useCallback(() => {
    if (!activeRef.current || phaseRef.current !== "speaking") return;
    if (typeof window !== "undefined") {
      window.speechSynthesis?.cancel();
    }
    utteranceRef.current = null;
    void startListeningRef.current();
  }, []);

  useEffect(() => {
    if (!enabled && activeRef.current) {
      stop();
    }
  }, [enabled, stop]);

  useEffect(() => stop, [stop]);

  return {
    phase,
    active: modeActive,
    partialTranscript,
    error,
    start,
    stop,
    interrupt,
  };
}
