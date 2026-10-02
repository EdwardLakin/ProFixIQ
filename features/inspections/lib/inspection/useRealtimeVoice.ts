"use client";

import {
  useCostOptimizedInspectionVoice,
  type InspectionVoiceOptions,
  type InspectionVoiceState,
} from "./useCostOptimizedInspectionVoice";

export type VoiceState = InspectionVoiceState;

export function useRealtimeVoice(
  handleTranscript: (text: string) => void | Promise<unknown>,
  maybeHandleWakeWord: (text: string) => string | null,
  opts?: InspectionVoiceOptions,
) {
  return useCostOptimizedInspectionVoice(
    handleTranscript,
    maybeHandleWakeWord,
    opts,
  );
}
