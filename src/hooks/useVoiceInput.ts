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
    if (typeof window === 'undefined' || !('webkitSpeechRecognition' in window)) return;

    const recognition = new window.webkitSpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = Array.from(event.results)
        .map(result => result[0].transcript)
        .join('');
      console.log('Voice input:', transcript);
      // You can call a handler here to process voice command
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event);
    };

    recognition.start();
    session.current = recognition;
    setIsListening(true);
  };

  const stopListening = () => {
    session.current?.stop();
    setIsListening(false);
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