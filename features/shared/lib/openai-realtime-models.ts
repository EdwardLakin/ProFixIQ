const DEFAULT_LIVE_MODEL = "gpt-live-1";
const DEFAULT_INSPECTION_TRANSCRIPTION_MODEL = "gpt-live-transcribe";

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

/**
 * GPT-Live is reserved for the premium conversational Technician Copilot.
 * Keep its model independent from the app's text/reasoning model controls.
 */
export function getOpenAILiveModel(): string {
  return env("OPENAI_LIVE_MODEL") ?? DEFAULT_LIVE_MODEL;
}

/**
 * Inspection voice is transcription-first rather than full-duplex conversation.
 * This keeps the inspection engine authoritative while avoiding GPT-Live's
 * elapsed-session pricing for long CVIP workflows.
 */
export function getOpenAIInspectionTranscriptionModel(): string {
  return (
    env("OPENAI_INSPECTION_TRANSCRIBE_MODEL") ??
    DEFAULT_INSPECTION_TRANSCRIPTION_MODEL
  );
}
