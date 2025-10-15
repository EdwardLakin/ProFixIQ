// features/inspections/lib/inspection/voiceControl.ts
export function startVoiceRecognition(
  onResult: (transcript: string) => void,
): SpeechRecognition {
  const SpeechRecognitionClass =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

  if (!SpeechRecognitionClass) {
    alert("Voice input not supported on this browser.");
    throw new Error("Speech Recognition not supported in this browser.");
  }

  const recognition: SpeechRecognition = new SpeechRecognitionClass();
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.lang = "en-US";

  recognition.onresult = (event: SpeechRecognitionEvent) => {
    const last = event.results[event.results.length - 1];
    const transcript = last?.[0]?.transcript?.trim();
    if (transcript) onResult(transcript);
  };

  recognition.onerror = (event: any) => {
    // Safari often throws "network"/"no-speech" or "aborted"
    console.error("Speech recognition error:", event?.error ?? event);
  };

  try {
    recognition.start();
  } catch (e) {
    // Safari throws if already started — ignore
    console.debug("recognition.start() guarded:", e);
  }
  return recognition;
}

export function stopVoiceRecognition(instance: SpeechRecognition | null) {
  try {
    instance?.stop();
  } catch {}
}