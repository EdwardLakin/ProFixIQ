// features/inspections/lib/inspection/StartListeningButton.tsx
"use client";

import { Button } from "@shared/components/ui/Button";

interface StartListeningButtonProps {
  isListening: boolean;
  onStart: () => void;
}

export default function StartListeningButton({
  isListening,
  onStart,
}: StartListeningButtonProps) {
  const handleStart = () => {
    if (isListening) return;
    onStart(); // parent will flip isListening only when WS + mic are actually started
  };

  return (
    <Button
      type="button"
      onClick={handleStart}
      disabled={isListening}
      variant={isListening ? "outline" : "copper"}
      size="sm"
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