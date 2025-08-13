"use client";

import {
  stopVoiceRecognition,
  startVoiceRecognition,
} from "@inspections/lib/inspection/voiceControl";

interface PauseResumeButtonProps {
  isPaused: boolean;
  onPause: () => void;
  onResume: () => void;
  isListening: boolean;
  setIsListening: (val: boolean) => void;
  recognitionInstance: SpeechRecognition | null;
  onTranscript?: (text: string) => void;
  setRecognitionRef: (instance: SpeechRecognition | null) => void;
}

const PauseResumeButton = ({
  isPaused,
  onPause,
  onResume,
  isListening,
  setIsListening,
  recognitionInstance,
  onTranscript,
  setRecognitionRef,
}: PauseResumeButtonProps) => {
  const handlePause = () => {
    stopVoiceRecognition(recognitionInstance);
    onPause();
    setIsListening(false);
  };

  const handleResume = () => {
    const newInstance = startVoiceRecognition((text: string) => {
      onTranscript?.(text);
    });
    setRecognitionRef(newInstance);
    onResume();
    setIsListening(true);
  };

  return (
    <div className="text-center mt-2">
      {isPaused ? (
        <button
          onClick={handleResume}
          className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
        >
          Resume
        </button>
      ) : (
        <button
          onClick={handlePause}
          className="bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-2 px-4 rounded"
        >
          Pause
        </button>
      )}
    </div>
  );
};

export default PauseResumeButton;
