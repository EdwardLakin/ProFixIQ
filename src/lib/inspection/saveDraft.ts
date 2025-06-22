import type { InspectionState } from './types';

export function saveDraft(state: InspectionState) {
  try {
    const draft = JSON.stringify(state);
    localStorage.setItem('inspectionDraft', draft);
  } catch (error) {
    console.error('Failed to save draft:', error);
  }
}