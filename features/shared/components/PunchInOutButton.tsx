"use client";

import { Button } from "@shared/components/ui/Button";

export interface ActiveShift {
  id: string;
  label?: string;
}

interface PunchInOutButtonProps {
  activeJob: ActiveShift | null; // active shift, not job
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
  const isOnShift = Boolean(activeJob);

  return (
    <div className="mt-4 w-full">
      <Button
        type="button"
        size="lg"
        variant={isOnShift ? "outline" : "copper"}
        className="flex w-full justify-center text-sm font-blackops tracking-[0.16em] uppercase"
        onClick={isOnShift ? onPunchOut : onPunchIn}
        isLoading={isLoading}
        aria-busy={isLoading}
      >
        {isOnShift ? "Punch Out (End Shift)" : "Punch In (Start Shift)"}
      </Button>

      {isOnShift && (
        <div className="mt-2 text-center text-[11px] uppercase tracking-[0.14em] text-emerald-400">
          ● On Shift
        </div>
      )}
    </div>
  );
};

export default PunchInOutButton;