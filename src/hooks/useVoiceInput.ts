import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
  }
}

export default function useVoiceInput() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const session = useRef<any>(null);

  const initRecognition = () => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

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

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event);
    };

    return recognition;
  };

  const startListening = () => {
    if (!session.current) {
      const recognition = initRecognition();
      if (!recognition) return;
      session.current = recognition;
    }

    try {
      session.current.start();
      setIsListening(true);
    } catch (err) {
      console.warn('Already started:', err);
    }
  };

  const pauseListening = () => {
    if (session.current) {
      session.current.stop();
      setIsListening(false);
    }
  };

  useEffect(() => {
    return () => {
      pauseListening();
    };
  }, []);

  return {
    isListening,
    transcript,
    startListening,
    pauseListening,
    session,
  };
}