// src/lib/inspection/useInspectionSession.ts
import { useEffect, useState } from 'react';
import { InspectionSession } from './types';
import { defaultInspectionSession } from './inspectionState';
import { processCommand } from './processCommand';
import { startVoiceRecognition } from './useInspectionVoice';

export default function useInspectionSession() {
  const [session, setSession] = useState<InspectionSession>(defaultInspectionSession);
  const [isListening, setIsListening] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [transcript, setTranscript] = useState('');

  const startListening = () => {
    setIsListening(true);
    setIsPaused(false);
    startVoiceRecognition({
      onResult: handleCommand,
      onStop: () => setIsListening(false),
    });
  };

  const pauseListening = () => {
    setIsPaused(true);
    setIsListening(false);
  };

  const resumeListening = () => {
    setIsPaused(false);
    setIsListening(true);
    startVoiceRecognition({
      onResult: handleCommand,
      onStop: () => setIsListening(false),
    });
  };

  const stopListening = () => {
    setIsListening(false);
    setIsPaused(false);
  };

  const handleCommand = (input: string) => {
    setTranscript(input);
    if (!session) return;
    const updated = processCommand(session, input);
    if (updated) {
      setSession({ ...updated });
    }
  };

  useEffect(() => {
    setSession(defaultInspectionSession);
  }, []);

  return {
    session,
    setSession,
    isListening,
    isPaused,
    transcript,
    startListening,
    pauseListening,
    resumeListening,
    stopListening,
  };
}