export function startVoiceRecognition({
  onResult,
  onStop,
}: {
  onResult: (transcript: string) => void;
  onStop?: () => void;
}) {
  const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.error('SpeechRecognition not supported');
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = false;

  recognition.onresult = (event: SpeechRecognitionEvent) => {
    const transcript = Array.from(event.results)
      .map((result) => result[0].transcript)
      .join('')
      .trim();
    if (transcript && onResult) onResult(transcript);
  };

  recognition.onend = () => {
    if (onStop) onStop();
  };

  recognition.start();
}