"use client";

import React, { useState } from "react";
import type { InspectionSession } from "@inspections/lib/inspection/types";
import { interpretTranscript } from "./interpretTranscript";
import { applyVoiceCommands } from "./commandMapper";

type Props = {
  session: InspectionSession;
  onUpdateSession: (patch: Partial<InspectionSession>) => void;
};

export default function VoiceInspectionController({ session, onUpdateSession }: Props) {
  const [isListening, setIsListening] = useState(false);

  // We'll wire browser SpeechRecognition here later
  const handleFakeTranscript = async () => {
    const transcript = "dummy transcript";
    const cmds = await interpretTranscript(transcript);
    applyVoiceCommands(cmds, session, onUpdateSession);
  };

  return (
    <div className="mt-2 text-xs text-neutral-300">
      <button
        type="button"
        onClick={handleFakeTranscript}
        className="rounded bg-neutral-800 px-3 py-1 text-xs text-white"
      >
        Test voice (stub)
      </button>
    </div>
  );
}
