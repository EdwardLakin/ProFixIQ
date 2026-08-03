"use client";

import React, { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { Button } from "@/features/shared/components/ui/Button";
import {
  useRealtimeVoice,
  type VoiceState,
} from "@/features/inspections/lib/inspection/useRealtimeVoice";

type VoiceDictationButtonProps = {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  idleLabel?: string;
  listeningLabel?: string;
  className?: string;
};

type SpeechRecognitionConstructor = new () => SpeechRecognition;
type DictationSource = "native" | "realtime" | null;

function getNativeSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

function nativeSpeechErrorMessage(error: string | undefined): string {
  switch (error) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access is blocked. Allow microphone access and try again.";
    case "audio-capture":
      return "No microphone is available.";
    case "network":
      return "Dictation could not reach the speech service.";
    case "no-speech":
      return "No speech was detected. Try again.";
    default:
      return "Voice dictation stopped unexpectedly. Try again.";
  }
}

export default function VoiceDictationButton({
  onTranscript,
  disabled = false,
  idleLabel = "Dictate",
  listeningLabel = "Stop dictation",
  className,
}: VoiceDictationButtonProps): JSX.Element {
  const [state, setState] = useState<VoiceState>("idle");
  const [error, setError] = useState<string | null>(null);
  const sourceRef = useRef<DictationSource>(null);
  const nativeRecognitionRef = useRef<SpeechRecognition | null>(null);
  const onTranscriptRef = useRef(onTranscript);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  const voice = useRealtimeVoice(
    (text) => onTranscript(text.trim()),
    (text) => text.trim() || null,
    {
      onStateChange: setState,
      onError: setError,
    },
  );

  const active = state === "connecting" || state === "listening";

  const startNativeDictation = (
    Constructor: SpeechRecognitionConstructor,
  ): void => {
    const recognition = new Constructor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => setState("listening");
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const completed: string[] = [];
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (!result?.isFinal) continue;
        const transcript = result[0]?.transcript?.trim();
        if (transcript) completed.push(transcript);
      }
      const transcript = completed.join(" ").trim();
      if (transcript) onTranscriptRef.current(transcript);
    };
    recognition.onerror = (event: Event & { error?: string }) => {
      setError(nativeSpeechErrorMessage(event.error));
      setState("error");
    };
    recognition.onend = () => {
      nativeRecognitionRef.current = null;
      sourceRef.current = null;
      setState("idle");
    };

    nativeRecognitionRef.current = recognition;
    sourceRef.current = "native";
    setState("connecting");
    recognition.start();
  };

  const toggle = async (): Promise<void> => {
    setError(null);
    if (active) {
      if (sourceRef.current === "native") {
        nativeRecognitionRef.current?.stop();
      } else {
        voice.stop();
        sourceRef.current = null;
      }
      return;
    }

    const NativeSpeechRecognition = getNativeSpeechRecognition();
    if (NativeSpeechRecognition) {
      try {
        startNativeDictation(NativeSpeechRecognition);
        return;
      } catch {
        nativeRecognitionRef.current = null;
        sourceRef.current = null;
      }
    }

    try {
      sourceRef.current = "realtime";
      await voice.start();
    } catch (caught) {
      sourceRef.current = null;
      setState("error");
      setError(
        caught instanceof Error ? caught.message : "Voice dictation unavailable.",
      );
    }
  };

  useEffect(() => {
    return () => {
      try {
        nativeRecognitionRef.current?.abort();
      } catch {}
      nativeRecognitionRef.current = null;
      sourceRef.current = null;
    };
  }, []);

  return (
    <div className={className}>
      <Button
        type="button"
        variant={active ? "outline" : "copper"}
        size="sm"
        disabled={disabled}
        onClick={() => void toggle()}
        aria-pressed={active}
        className="gap-2"
      >
        {active ? (
          <Square className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <Mic className="h-3.5 w-3.5" aria-hidden />
        )}
        {state === "connecting"
          ? "Connecting…"
          : active
            ? listeningLabel
            : idleLabel}
      </Button>
      {error ? (
        <div className="mt-1 text-[11px] text-red-300" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}
