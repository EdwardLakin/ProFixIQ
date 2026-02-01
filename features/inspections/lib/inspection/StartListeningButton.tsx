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
      className={`inline-flex items-center gap-2 rounded-full text-[11px] font-semibold uppercase tracking-[0.18em] ${
        isListening
          ? "border-[color:var(--accent-copper-soft,#f97316)] bg-black/70 text-[color:var(--accent-copper,#f97316)]"
          : "bg-[linear-gradient(to_right,var(--accent-copper-soft,#fb923c),var(--accent-copper,#ea580c))] text-black shadow-[0_0_18px_rgba(234,88,12,0.6)]"
      }`}
    >
      <span
        className={`inline-block h-2 w-2 rounded-full ${
          isListening
            ? "bg-[color:var(--accent-copper,#f97316)] animate-pulse"
            : "bg-black/80"
        }`}
      />
      {isListening ? "Listening…" : "Start Listening"}
    </Button>
  );
}