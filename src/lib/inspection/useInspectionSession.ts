import { useEffect, useRef, useState } from 'react';
import { startVoiceRecognition, stopVoiceRecognition } from './useInspectionVoice';
import { processCommand } from './processCommand';
import type { InspectionSession } from './types';

const MAX_RETRIES = 3;

export default function useInspectionSession(session: InspectionSession, setSession: (s: InspectionSession) => void) {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const retryCount = useRef(0);

  const handleResult = (input: string) => {
  const updated = processCommand(input, session);
  if (updated) {
    setSession(updated);
  }
};

  const startListening = () => {
    const recognition = startVoiceRecognition(handleResult);
    recognitionRef.current = recognition;
    setIsListening(true);
  };

  const stopListening = () => {
    stopVoiceRecognition(recognitionRef.current);
    setIsListening(false);
  };

  const pauseListening = () => stopListening();
  const resumeListening = () => startListening();

  return {
    isListening,
    startListening,
    stopListening,
    pauseListening,
    resumeListening,
  };
}