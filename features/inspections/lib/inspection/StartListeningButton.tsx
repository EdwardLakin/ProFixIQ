"use client";

import { Button } from "@shared/components/ui/Button";

interface StartListeningButtonProps {
  /** True only when realtime WS + mic are actually active */
  isListening: boolean;

  /**
   * Async start handler from parent.
   * MUST resolve only after mic + WS are ready.
   * MUST throw or reject on failure.
   */
  onStart: () => Promise<void>;
}

export default function StartListeningButton({
  isListening,
  onStart,
}: StartListeningButtonProps) {
  const handleStart = async () => {
    if (isListening) return;

    try {
      await onStart();
      // ⛔ DO NOT set isListening here
      // Parent owns listening state based on realtime engine
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[StartListeningButton] start failed", err);
      // UI will remain idle; error state handled upstream
    }
  };

  return (
    <Button
      type="button"
      onClick={handleStart}
      disabled={isListening}
      variant={isListening ? "outline" : "copper"}
      size="sm"
      aria-pressed={isListening}
      aria-label={isListening ? "Voice listening active" : "Start voice listening"}
      className={`inline-flex items-center gap-2 rounded-lg border-white/20 text-[11px] font-semibold tracking-[0.04em] ${
        isListening
          ? "bg-white/10 text-white"
          : "bg-[color:var(--brand-primary)] text-white shadow-none"
      }`}
    >
      <span
        className={`inline-block h-2 w-2 rounded-full ${
          isListening
            ? "bg-orange-300 animate-pulse"
            : "bg-white"
        }`}
      />
      {isListening ? "Listening…" : "Start Listening"}
    </Button>
  );
}
