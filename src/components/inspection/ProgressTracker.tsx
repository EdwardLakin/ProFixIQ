// src/components/inspection/ProgressTracker.tsx
import React from 'react';

interface ProgressTrackerProps {
  currentSection: number;
  totalSections: number;
  currentItem: number;
  totalItems: number;
}

const ProgressTracker: React.FC<ProgressTrackerProps> = ({
  currentSection,
  totalSections,
  currentItem,
  totalItems,
}) => {
  return (
    <div className="text-center text-sm text-gray-400 mb-2">
      Section {currentSection + 1} of {totalSections} • Item {currentItem + 1} of {totalItems}
    </div>
  );
};

export default ProgressTracker;