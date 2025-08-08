// lib/inspection/ProgressTracker.tsx

import React from "react";

interface ProgressTrackerProps {
  currentItem: number;
  currentSection: number;
  totalSections: number;
  totalItems: number;
}

const ProgressTracker = ({
  currentItem,
  currentSection,
  totalSections,
  totalItems,
}: ProgressTrackerProps) => {
  return (
    <div className="text-xs text-gray-400 text-center mb-2">
      Section {currentSection + 1} of {totalSections} • Item {currentItem + 1}{" "}
      of {totalItems}
    </div>
  );
};

export default ProgressTracker;
