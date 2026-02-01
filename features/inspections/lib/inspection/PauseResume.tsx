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
    <div className="mt-2 text-center">
      {isPaused ? (
        <button
          type="button"
          onClick={onResume}
          disabled={disabled}
          className="rounded bg-green-600 px-4 py-2 font-bold text-white hover:bg-green-700 disabled:opacity-50"
        >
          Resume
        </button>
      ) : (
        <button
          type="button"
          onClick={onPause}
          disabled={disabled}
          className="rounded bg-yellow-600 px-4 py-2 font-bold text-white hover:bg-yellow-700 disabled:opacity-50"
        >
          Pause
        </button>
      )}
    </div>
  );
}