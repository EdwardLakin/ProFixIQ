import type { VoiceCommand } from "./voiceTypes";

/**
 * Thin wrapper around your AI interpreter (to be implemented).
 * For now we just return an empty array.
 */
export async function interpretTranscript(
  transcript: string,
): Promise<VoiceCommand[]> {
  console.debug("interpretTranscript (stub)", transcript);
  return [];
}
