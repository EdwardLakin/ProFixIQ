'use client';

import React from 'react';
import Button from '@components/ui/Button';
import { JobLine } from './JobQueue';

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
    <div className="w-full text-center mt-4">
      <Button
        className={`w-full text-lg ${
          isPunchedIn ? 'bg-orange-600 hover:bg-orange-700' : 'bg-blue-600 hover:bg-blue-700'
        }`}
        onClick={isPunchedIn ? onPunchOut : onPunchIn}
        disabled={isLoading}
      >
        {isLoading
          ? 'Loading...'
          : isPunchedIn
          ? `Punch Out of ${activeJob?.vehicle}`
          : 'Punch In to Job'}
      </Button>
    </div>
  );
};

export default PunchInOutButton;