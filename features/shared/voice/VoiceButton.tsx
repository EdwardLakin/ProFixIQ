"use client";

import { useVoice } from "./VoiceProvider";
import { useState } from "react";
import { buttonClasses } from "@/features/shared/components/ui/Button"; // your existing style helper (optional)

export default function VoiceButton() {
  const { state, startListening, stopListening, runTranscript } = useVoice();
  const [pressed, setPressed] = useState(false);

  const onDown = () => {
    setPressed(true);
    startListening();
  };
  const onUp = async () => {
    setPressed(false);
    stopListening();
    await runTranscript();
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      <button
        onMouseDown={onDown}
        onMouseUp={onUp}
        onTouchStart={onDown}
        onTouchEnd={onUp}
        className={buttonClasses({
          variant: "default",
          size: "lg",
          className: pressed ? "scale-95" : "",
        })}
        aria-pressed={state.isListening}
        title={state.isListening ? "Listening… release to run" : "Hold to talk"}
      >
        {state.isListening ? "Listening…" : "Hold to Talk"}
      </button>

      {state.error ? (
        <div className="text-xs text-red-400 bg-red-950/50 border border-red-800 rounded px-2 py-1 max-w-[280px]">
          {state.error}
        </div>
      ) : null}

      {state.transcript ? (
        <div className="text-xs text-neutral-200 bg-neutral-900/80 border border-neutral-800 rounded px-2 py-1 max-w-[320px]">
          {state.transcript}
        </div>
      ) : null}
    </div>
  );
}