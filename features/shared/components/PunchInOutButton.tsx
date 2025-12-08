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

  return (
    <div className="mt-4 w-full">
      <Button
        type="button"
        size="lg"
        variant={isPunchedIn ? "outline" : "copper"}
        className="flex w-full justify-center text-sm tracking-[0.16em] uppercase"
        onClick={isPunchedIn ? onPunchOut : onPunchIn}
        isLoading={isLoading}
      >
        {isPunchedIn
          ? `Punch Out of ${activeJob?.vehicle}`
          : "Punch In to Job"}
      </Button>
    </div>
  );
};

export default PunchInOutButton;