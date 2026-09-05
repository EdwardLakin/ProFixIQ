// Thin alias over the shared Realtime transcription transport (see
// features/shared/voice/useRealtimeTranscription.ts). Inspection voice
// control and dictation now share the same hardened WebSocket/audio
// transport the Technician CoPilot uses — including mic pause()/resume()
// around spoken feedback and generation-safe startup/teardown — instead of
// an independently-maintained duplicate. This file exists only so existing
// import paths and exported names (useRealtimeVoice, VoiceState) stay
// stable; command interpretation (interpretCommand, GenericInspectionScreen's
// handleTranscript/apply pipeline) is unchanged by this move.
"use client";

export {
  useRealtimeTranscription as useRealtimeVoice,
  type RealtimeTranscriptionState as VoiceState,
} from "@/features/shared/voice/useRealtimeTranscription";
