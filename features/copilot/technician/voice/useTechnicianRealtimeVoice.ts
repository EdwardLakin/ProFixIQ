// Thin alias over the shared Realtime transcription transport (see
// features/shared/voice/useRealtimeTranscription.ts). The Technician CoPilot
// and inspection/dictation voice control now share one hardened
// implementation instead of two independently-maintained copies; this file
// exists only so the CoPilot's existing import path and exported names
// (useTechnicianRealtimeVoice, TechnicianRealtimeVoiceState) stay stable.
"use client";

export {
  useRealtimeTranscription as useTechnicianRealtimeVoice,
  type RealtimeTranscriptionState as TechnicianRealtimeVoiceState,
} from "@/features/shared/voice/useRealtimeTranscription";
