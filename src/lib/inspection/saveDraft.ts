import type { InspectionState } from './types';

export function saveDraft(state: InspectionState) {
  try {
    const serializedState = JSON.stringify(state);
    localStorage.setItem('inspectionDraft', serializedState);
  } catch (error) {
    console.error('Failed to save draft:', error);
  }
}

export function loadDraft(): InspectionState | null {
  try {
    const serializedState = localStorage.getItem('inspectionDraft');
    return serializedState ? JSON.parse(serializedState) : null;
  } catch (error) {
    console.error('Failed to load draft:', error);
    return null;
  }
}