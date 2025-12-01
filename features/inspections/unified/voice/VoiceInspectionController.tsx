// features/inspections/unified/voice/VoiceInspectionController.tsx
"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { InspectionSession } from "@inspections/lib/inspection/types";

import { interpretTranscript } from "./interpretTranscript";
import { applyVoiceCommands } from "./commandMapper";

type Props = {
  session: InspectionSession;
  onUpdateSession: (patch: Partial<InspectionSession>) => void;
};

export default function VoiceInspectionController({
  session,
  onUpdateSession,
}: Props) {
  const [isListening, setIsListening] = useState<boolean>(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const initRecognition = useCallback(() => {
    if (typeof window === "undefined") return null;

    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn("Browser speech recognition unsupported");
      return null;
    }

    const recog = new SpeechRecognition();
    recog.lang = "en-US";
    recog.interimResults = true;
    recog.continuous = false;

    return recog;
  }, []);

  const startListening = useCallback(() => {
    const recog = recognitionRef.current ?? initRecognition();
    if (!recog) return;

    recognitionRef.current = recog;
    setIsListening(true);
    onUpdateSession({ isListening: true });

    recog.onresult = async (event: SpeechRecognitionEvent) => {
      let finalText = "";

      for (let i = 0; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) finalText += res[0].transcript;
      }

      if (finalText.trim().length > 0) {
        const cmds = await interpretTranscript(finalText.trim());
        applyVoiceCommands(cmds, session, onUpdateSession);
      }
    };

    recog.onerror = () => {
      setIsListening(false);
      onUpdateSession({ isListening: false });
    };

    recog.onend = () => {
      setIsListening(false);
      onUpdateSession({ isListening: false });
    };

    recog.start();
  }, [initRecognition, onUpdateSession, session]);

  const stopListening = useCallback(() => {
    const recog = recognitionRef.current;
    if (recog) recog.stop();
    setIsListening(false);
    onUpdateSession({ isListening: false });
  }, [onUpdateSession]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let wakeActive = true;
    const wakePhrase = "hey techy";

    const handleWake = (e: SpeechRecognitionEvent) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) text += r[0].transcript.toLowerCase();
      }
      if (text.includes(wakePhrase)) {
        startListening();
      }
    };

    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) return;

    const wake = new SpeechRecognition();
    wake.lang = "en-US";
    wake.interimResults = false;
    wake.continuous = true;

    wake.onresult = handleWake;
    wake.onerror = () => {};
    wake.onend = () => {
      if (wakeActive) wake.start();
    };

    wake.start();

    return () => {
      wakeActive = false;
      wake.stop();
    };
  }, [startListening]);

  return (
    <div className="mt-2 flex items-center gap-2 text-xs text-neutral-300">
      <button
        type="button"
        onClick={isListening ? stopListening : startListening}
        className="rounded bg-neutral-800 px-3 py-1 text-xs text-white"
      >
        {isListening ? "Stop listening" : "Start voice"}
      </button>

      <span className={isListening ? "text-green-400" : "text-neutral-500"}>
        {isListening ? "Listening…" : "Idle"}
      </span>
    </div>
  );
}