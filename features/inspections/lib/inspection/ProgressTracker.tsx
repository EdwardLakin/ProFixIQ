// lib/inspection/ProgressTracker.tsx



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
  const sectionProgress = totalSections > 0 ? currentSection / totalSections : 0;
  const itemProgress = totalItems > 0 ? currentItem / totalItems / Math.max(totalSections, 1) : 0;
  const progress = Math.min(100, Math.max(2, (sectionProgress + itemProgress) * 100));

  return (
    <div className="min-w-[180px] sm:min-w-[240px]">
      <div className="flex items-center justify-between gap-3 text-xs text-[color:var(--theme-text-secondary)]">
        <span>Section {currentSection + 1} of {totalSections}</span>
        <span>Item {Math.min(currentItem + 1, Math.max(totalItems, 1))} of {totalItems}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[color:var(--theme-surface-inset)]">
        <div
          className="h-full rounded-full bg-[color:var(--brand-primary)] transition-[width] duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
};

export default ProgressTracker;
