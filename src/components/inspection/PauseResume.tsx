// src/components/inspection/PauseResume.tsx
import React from 'react';

interface PauseResumeProps {
  isPaused: boolean;
  onToggle: () => void;
}

const PauseResume: React.FC<PauseResumeProps> = ({ isPaused, onToggle }) => {
  return (
    <button
      onClick={onToggle}
      className={`px-4 py-2 rounded font-bold transition duration-200 ${
        isPaused
          ? 'bg-yellow-500 text-black hover:bg-yellow-600'
          : 'bg-blue-600 text-white hover:bg-blue-700'
      }`}
    >
      {isPaused ? 'Resume Listening' : 'Pause Listening'}
    </button>
  );
};

export default PauseResume;