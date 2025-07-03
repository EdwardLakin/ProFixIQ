import { InspectionSession } from '@lib/inspection/types';

interface ProgressTrackerProps {
  session: InspectionSession;
}

const ProgressTracker = ({ session }: ProgressTrackerProps) => {
  const totalSections = session.sections.length;
  const currentSection = session.currentSectionIndex + 1;
  const currentItem = session.currentItemIndex + 1;
  const totalItems =
    session.sections[session.currentSectionIndex]?.items.length || 0;

  return (
    <div className="text-xs text-gray-400 text-center mb-2">
      Section {currentSection} of {totalSections} • Item {currentItem} of {totalItems}
    </div>
  );
};

export default ProgressTracker;