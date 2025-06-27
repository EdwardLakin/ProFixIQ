import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    webkitSpeechRecognition: any;
  }
}

export default function useVoiceInput() {
  const [isListening, setIsListening] = useState(false);
  const session = useRef<SpeechRecognition | null>(null);

  const startListening = () => {
    if (typeof window === 'undefined' || !('webkitSpeechRecognition' in window)) {
      console.warn('Speech recognition not supported in this browser.');
      return;
    }

    const recognition = new window.webkitSpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join('');
      console.log('Voice input:', transcript);
      // TODO: pass transcript to inspection handler
    };

    recognition.onerror = (event: Event) => {
      console.error('Speech recognition error:', event);
    };

    recognition.start();
    session.current = recognition;
    setIsListening(true);
  };

  const stopListening = () => {
    if (session.current) {
      session.current.stop();
      setIsListening(false);
    }
  };

  useEffect(() => {
    return () => {
      stopListening();
    };
  }, []);

  return {
    isListening,
    startListening,
    stopListening,
    session,
  };
}