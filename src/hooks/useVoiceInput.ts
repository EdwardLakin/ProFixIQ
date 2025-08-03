'use client';

import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    webkitSpeechRecognition: typeof SpeechRecognition;
    SpeechRecognition: typeof SpeechRecognition;
  }
}

type SpeechRecognitionInstance = SpeechRecognition | null;

export default function useVoiceInput() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const session = useRef<SpeechRecognitionInstance>(null);

  const initRecognition = (): SpeechRecognitionInstance => {
    const SpeechRecognition =
      typeof window !== 'undefined' &&
      (window.SpeechRecognition || window.webkitSpeechRecognition);

    if (!SpeechRecognition) {
      console.error('Speech recognition not supported.');
      return null;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const text = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join('');
      setTranscript(text);
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    return recognition;
  };

  const startListening = () => {
    if (!session.current) {
      session.current = initRecognition();
    }

    try {
      session.current?.start();
      setIsListening(true);
    } catch (err) {
      console.warn('Recognition already started or failed:', err);
    }
  };

  const pauseListening = () => {
    try {
      session.current?.stop();
    } catch (err) {
      console.warn('Failed to stop recognition:', err);
    }
    setIsListening(false);
  };

  useEffect(() => {
    return () => {
      pauseListening(); // Ensure cleanup on unmount
    };
  }, []);

  return {
    isListening,
    setIsListening,
    transcript,
    setTranscript,
    startListening,
    pauseListening,
    session,
  };
}