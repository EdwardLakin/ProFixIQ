import type { InspectionState, InspectionItem } from './types';

let inspectionDraft: Record<string, Record<string, InspectionItem>> = {};
let transcriptLog: string[] = [];
let isPaused: boolean = false;
let isComplete: boolean = false;
let currentItemId: string | null = null;

export function resetInspectionState() {
  inspectionDraft = {};
  transcriptLog = [];
  isPaused = false;
  isComplete = false;
  currentItemId = null;
}

export function getInspectionState(): InspectionState {
  const state: InspectionState = {
    sections: inspectionDraft,
    transcriptLog,
    paused: isPaused,
    complete: isComplete,
    currentItemId,
  };
  return state;
}

export function updateInspectionItem(
  section: string,
  item: string,
  updates: Partial<InspectionItem>
) {
  if (!inspectionDraft[section]) inspectionDraft[section] = {};
  const existing = inspectionDraft[section][item] || {};
  inspectionDraft[section][item] = { ...existing, ...updates };
}

export function logTranscript(text: string) {
  transcriptLog.push(text);
}

export function pauseInspection() {
  isPaused = true;
}

export function resumeInspection() {
  isPaused = false;
}

export function setCurrentItemId(id: string | null) {
  currentItemId = id;
}