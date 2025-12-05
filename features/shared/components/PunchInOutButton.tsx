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

  return (
    <div className="w-full mt-4">
      <Button
        type="button"
        size="lg"
        variant={isPunchedIn ? "outline" : "orange"}
        className="w-full text-sm justify-center"
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