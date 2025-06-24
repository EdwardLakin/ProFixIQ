import { useEffect, useRef } from 'react';

export function useVoiceInput(
  onCommand: (input: string) => void,
  setListening: (value: boolean) => void
) {
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn('Speech recognition not supported in this browser.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setListening(true);
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = Array.from(event.results)
        .map(result => result[0])
        .map(result => result.transcript)
        .join('')
        .trim();

      if (transcript) {
        onCommand(transcript);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.stop();
    };
  }, [onCommand, setListening]);

  const start = () => {
    recognitionRef.current?.start();
  };

  const stop = () => {
    recognitionRef.current?.stop();
  };

  return { start, stop };
}