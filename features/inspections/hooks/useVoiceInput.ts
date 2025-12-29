//features/inspections/hooks/useVoiceInput.ts

"use client";

import { useEffect, useRef, useState } from "react";

type SRConstructor = new () => SpeechRecognition;
type SpeechRecognitionInstance = SpeechRecognition | null;

function resolveSR(): SRConstructor | undefined {
  if (typeof window === "undefined") return undefined;

  // Narrow `window` to the two possible constructors
  const w = window as unknown as {
    SpeechRecognition?: SRConstructor;
    webkitSpeechRecognition?: SRConstructor;
  };

  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? undefined;
}

export default function useVoiceInput() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const session = useRef<SpeechRecognitionInstance>(null);

  const initRecognition = (): SpeechRecognitionInstance => {
    const SR = resolveSR();
    if (!SR) {
      console.error("Speech recognition not supported.");
      return null;
    }

    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const text = Array.from(event.results)
        .map((r) => r[0].transcript)
        .join("");
      setTranscript(text);
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    return recognition;
  };

  const startListening = () => {
    if (!session.current) {
      session.current = initRecognition();
    }
    try {
      session.current?.start();
      setIsListening(true);
    } catch (err) {
      console.warn("Recognition already started or failed:", err);
    }
  };

  const pauseListening = () => {
    try {
      session.current?.stop();
    } catch (err) {
      console.warn("Failed to stop recognition:", err);
    }
    setIsListening(false);
  };

  useEffect(() => {
    return () => {
      try {
        session.current?.stop();
      } catch {
        /* ignore */
      }
    };
  }, []);

  return {
    isListening,
    setIsListening,
    transcript,
    setTranscript,
    startListening,
    pauseListening,
    session,
  };
}