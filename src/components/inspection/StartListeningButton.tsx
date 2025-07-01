// src/components/inspection/StartListeningButton.tsx
import React from 'react';

interface StartListeningButtonProps {
  onStart: () => void;
}

const StartListeningButton: React.FC<StartListeningButtonProps> = ({ onStart }) => {
  return (
    <button
      onClick={onStart}
      className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded text-xl mb-4 shadow-md"
    >
      🎤 Start Listening
    </button>
  );
};

export default StartListeningButton;