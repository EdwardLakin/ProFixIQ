// components/inspection/ProgressTracker.tsx

interface ProgressTrackerProps {
  sectionIndex: number;
  totalSections: number;
  itemIndex: number;
  totalItems: number;
}

const ProgressTracker = ({
  sectionIndex,
  totalSections,
  itemIndex,
  totalItems,
}: ProgressTrackerProps) => {
  return (
    <div className="text-xs text-gray-300 text-center mt-2 mb-4">
      Section {sectionIndex + 1} of {totalSections} • Item {itemIndex + 1} of {totalItems}
    </div>
  );
};

export default ProgressTracker;