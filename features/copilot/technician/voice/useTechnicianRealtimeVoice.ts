"use client";

import {
  useRealtimeTranscription,
  type HandleTranscriptFn,
  type RealtimeTranscriptionOptions,
  type RealtimeTranscriptionState,
} from "@/features/shared/voice/useRealtimeTranscription";

export type TechnicianRealtimeVoiceState = RealtimeTranscriptionState;

export function useTechnicianRealtimeVoice(
  handleTranscript: HandleTranscriptFn,
  maybeHandleWakeWord: (text: string) => string | null,
  opts?: RealtimeTranscriptionOptions,
) {
  return useRealtimeTranscription(handleTranscript, maybeHandleWakeWord, {
    ...opts,
    surface: "technician_copilot",
  });
}
