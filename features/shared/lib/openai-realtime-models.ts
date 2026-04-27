const DEFAULT_REALTIME_TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function getOpenAIRealtimeTranscriptionModel(): string {
  return env("OPENAI_REALTIME_TRANSCRIBE_MODEL")
    ?? env("OPENAI_FAST_MODEL")
    ?? env("OPENAI_MODEL")
    ?? DEFAULT_REALTIME_TRANSCRIPTION_MODEL;
}
