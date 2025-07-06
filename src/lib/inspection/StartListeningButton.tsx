'use client';

import { useEffect } from 'react';

interface StartListeningButtonProps {
  isListening: boolean;
  setIsListening: (value: boolean) => void;
  startSession?: () => void;
}

export default function StartListeningButton({
  isListening,
  setIsListening,
  startSession,
}: StartListeningButtonProps) {
  const handleStart = () => {
    setIsListening(true);
    if (startSession) {
      startSession();
    }
  };

  useEffect(() => {
    if (isListening) {
      console.log('Voice recognition is active.');
      // Add voice recognition startup logic here if needed
    }
  }, [isListening]);

  return (
    <button
      onClick={handleStart}
      className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
    >
      Start Listening
    </button>
  );
}