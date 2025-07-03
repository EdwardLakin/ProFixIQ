'use client';

import React, { useEffect, useRef, useState } from 'react';
import { handleTranscript } from '@lib/inspection/handleTranscript';
import useInspectionSession from '@lib/inspection/useInspectionSession';
import maintenance50Point from './templates/maintenance50Point';

const StartListeningButton = () => {
  const {
    session,
    updateItem,
    isListening,
    setIsListening,
    addQuoteLine,
  } = useInspectionSession({ initialSession: maintenance50Point });

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const [transcript, setTranscript] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.error('SpeechRecognition not supported');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const lastResult = event.results[event.results.length - 1];
      if (!lastResult.isFinal) return;

      const spokenText = lastResult[0].transcript.trim();
      setTranscript(spokenText);

      handleTranscript({
        transcript: spokenText,
        session,
        updateItem,
        addQuoteLine,
      });
    };

    recognitionRef.current = recognition;
  }, [session, updateItem, addQuoteLine]);

  const toggleListening = () => {
    if (!recognitionRef.current) return;

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  return (
    <button
      onClick={toggleListening}
      className={`px-4 py-2 rounded ${
        isListening ? 'bg-red-600' : 'bg-green-600'
      } text-white font-bold`}
    >
      {isListening ? 'Stop Listening' : 'Start Listening'}
    </button>
  );
};

export default StartListeningButton;