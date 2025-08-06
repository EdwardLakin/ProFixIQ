export function startVoiceRecognition(
  onResult: (transcript: string) => void
): SpeechRecognition {
  const SpeechRecognitionClass =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognitionClass) {
    throw new Error('Speech Recognition not supported in this browser.');
  }

  const recognition = new SpeechRecognitionClass();

  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.lang = 'en-US';

  recognition.onresult = (event: SpeechRecognitionEvent) => {
    const lastResult = event.results[event.results.length - 1];
    const transcript = lastResult[0].transcript.trim();
    onResult(transcript);
  };

  recognition.onerror = (event: SpeechRecognitionEvent) => {
    console.error('Speech recognition error:', event.error);
  };

  recognition.start();
  return recognition;
}

export function stopVoiceRecognition(instance: SpeechRecognition | null) {
  if (instance) {
    instance.stop();
  }
}