// components/inspection/ProgressTracker.tsx

import React from 'react';

export interface ProgressTrackerProps {
  currentSectionIndex: number;
  currentItemIndex: number;
}

const ProgressTracker: React.FC<ProgressTrackerProps> = ({
  currentSectionIndex,
  currentItemIndex,
}) => {
  return (
    <div className="text-sm text-orange-400 text-center mb-2">
      Section {currentSectionIndex + 1} • Item {currentItemIndex + 1}
    </div>
  );
};

export default ProgressTracker;