'use client';

import { useEffect } from 'react';
import useInspectionSession from '@lib/inspection/useInspectionSession';

interface PauseResumeButtonProps {
  isPaused: boolean;
  onPause: () => void;
  onResume: () => void;
}

const PauseResumeButton = ({
  isPaused,
  onPause,
  onResume,
}: PauseResumeButtonProps) => {
  const { session } = useInspectionSession();

  useEffect(() => {
    // Optional: log status when toggled
    console.log('Inspection status:', session.status);
  }, [session.status]);

  return (
    <div className="text-center mt-2">
      {isPaused ? (
        <button
          onClick={onResume}
          className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
        >
          Resume
        </button>
      ) : (
        <button
          onClick={onPause}
          className="bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-2 px-4 rounded"
        >
          Pause
        </button>
      )}
    </div>
  );
};

export default PauseResumeButton;