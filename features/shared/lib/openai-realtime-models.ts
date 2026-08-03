const DEFAULT_REALTIME_TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

/**
 * Realtime transcription requires an audio transcription model. Do not fall
 * back to the app's general text/reasoning model variables: those values can
 * be valid elsewhere while being rejected by the Realtime API.
 */
export function getOpenAIRealtimeTranscriptionModel(): string {
  return (
    env("OPENAI_REALTIME_TRANSCRIBE_MODEL") ??
    DEFAULT_REALTIME_TRANSCRIPTION_MODEL
  );
}
