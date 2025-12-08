// features/shared/components/PunchInOutButton.tsx
"use client";

import { Button } from "@shared/components/ui/Button";

export interface JobLine {
  id: string;
  vehicle: string;
}

interface PunchInOutButtonProps {
  activeJob: JobLine | null;
  onPunchIn: () => void;
  onPunchOut: () => void;
  isLoading?: boolean;
}

const PunchInOutButton: React.FC<PunchInOutButtonProps> = ({
  activeJob,
  onPunchIn,
  onPunchOut,
  isLoading = false,
}) => {
  const isPunchedIn = !!activeJob;

  const handleClick = () => {
    if (isPunchedIn) onPunchOut();
    else onPunchIn();
  };

  const primaryLabel = isPunchedIn ? "Punch out" : "Punch in to job";
  const secondaryLabel = isPunchedIn
    ? activeJob?.vehicle ?? ""
    : "Start tracking time on this job";

  return (
    <div className="mt-4 w-full">
      <Button
        type="button"
        size="lg"
        variant={isPunchedIn ? "outline" : "copper"}
        onClick={handleClick}
        isLoading={isLoading}
        className={[
          "w-full justify-center rounded-2xl border px-4 py-3 text-sm shadow-card backdrop-blur-md",
          isPunchedIn
            ? "border-emerald-400/70 bg-emerald-500/5 text-emerald-100 hover:bg-emerald-500/10"
            : "border-[var(--accent-copper-soft)]/70 bg-[var(--glass-bg)] text-white hover:bg-[var(--accent-copper-soft)]/18",
        ].join(" ")}
      >
        <div className="flex flex-col items-center">
          <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em]">
            {primaryLabel}
          </span>
          {secondaryLabel && (
            <span className="mt-0.5 text-[0.7rem] text-neutral-200">
              {secondaryLabel}
            </span>
          )}
        </div>
      </Button>
    </div>
  );
};

export default PunchInOutButton;