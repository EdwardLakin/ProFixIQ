// features/inspections/lib/inspection/PauseResume.tsx
"use client";

interface PauseResumeButtonProps {
  isPaused: boolean;
  onPause: () => void;
  onResume: () => void;
  disabled?: boolean;
}

export default function PauseResumeButton({
  isPaused,
  onPause,
  onResume,
  disabled,
}: PauseResumeButtonProps) {
  return (
    <div className="text-center">
      {isPaused ? (
        <button
          type="button"
          onClick={onResume}
          disabled={disabled}
          className="rounded-lg border border-[color:var(--theme-border-strong)] bg-[color:var(--theme-surface-subtle)] px-4 py-2 text-xs font-semibold text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-hover)] disabled:opacity-50"
        >
          Resume
        </button>
      ) : (
        <button
          type="button"
          onClick={onPause}
          disabled={disabled}
          className="rounded-lg border border-[color:var(--theme-border-strong)] bg-[color:var(--theme-surface-subtle)] px-4 py-2 text-xs font-semibold text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-hover)] disabled:opacity-50"
        >
          Pause
        </button>
      )}
    </div>
  );
}
