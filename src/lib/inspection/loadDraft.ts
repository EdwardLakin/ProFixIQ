import type { InspectionState } from './types';

export function loadDraft(): InspectionState | null {
  try {
    const draft = localStorage.getItem('inspectionDraft');
    if (!draft) return null;

    return JSON.parse(draft) as InspectionState;
  } catch (error) {
    console.error('Failed to load draft:', error);
    return null;
  }
}