"use client";

import { useEffect } from "react";

interface StartListeningButtonProps {
  isListening: boolean;
  setIsListening: (value: boolean) => void;
  onStart: () => void;
}

export default function StartListeningButton({
  isListening,
  setIsListening,
  onStart,
}: StartListeningButtonProps) {
  const handleStart = () => {
    setIsListening(true);
    onStart(); // Trigger the actual startListening logic from parent
  };

  useEffect(() => {
    if (isListening) {
      console.log("Voice recognition is active.");
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
