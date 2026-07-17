"use client";

import { useState } from "react";
import { Mic, Square } from "lucide-react";
import { Button } from "@shared/components/ui/Button";
import {
  useRealtimeVoice,
  type VoiceState,
} from "@inspections/lib/inspection/useRealtimeVoice";

type VoiceDictationButtonProps = {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  idleLabel?: string;
  listeningLabel?: string;
  className?: string;
};

export default function VoiceDictationButton({
  onTranscript,
  disabled = false,
  idleLabel = "Dictate",
  listeningLabel = "Stop dictation",
  className,
}: VoiceDictationButtonProps): JSX.Element {
  const [state, setState] = useState<VoiceState>("idle");
  const [error, setError] = useState<string | null>(null);

  const voice = useRealtimeVoice(
    (text) => onTranscript(text.trim()),
    (text) => text.trim() || null,
    {
      onStateChange: setState,
      onError: setError,
    },
  );

  const active = state === "connecting" || state === "listening";

  const toggle = async (): Promise<void> => {
    setError(null);
    if (active) {
      voice.stop();
      return;
    }

    try {
      await voice.start();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Voice dictation unavailable.",
      );
    }
  };

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
