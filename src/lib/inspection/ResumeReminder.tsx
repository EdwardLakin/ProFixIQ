// src/components/inspection/ResumeReminder.tsx
import React from 'react';

interface ResumeReminderProps {
  onResume: () => void;
}

const ResumeReminder: React.FC<ResumeReminderProps> = ({ onResume }) => {
  return (
    <div
      className="bg-yellow-200 text-yellow-900 px-4 py-2 rounded text-center cursor-pointer shadow-lg"
      onClick={onResume}
    >
      Inspection paused – tap to resume
    </div>
  );
};

export default ResumeReminder;