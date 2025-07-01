// components/inspection/ResumeReminder.tsx

interface ResumeReminderProps {
  isPaused: boolean;
  onResume: () => void;
  onClose: () => void;
}

const ResumeReminder = ({ isPaused, onResume }: ResumeReminderProps) => {
  if (!isPaused) return null;

  return (
    <div
      onClick={onResume}
      className="bg-yellow-700 text-white text-sm py-2 px-4 rounded shadow-md cursor-pointer mx-4 text-center animate-pulse"
    >
      Inspection paused — tap to resume
    </div>
  );
};

export default ResumeReminder;