// src/lib/inspection/inspectionState.ts

import { InspectionState, InspectionStatus } from '@lib/inspection/types';

const STORAGE_KEY = 'inspectionState';

export function loadInspectionState(): InspectionState | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as InspectionState;
  } catch (e) {
    console.error('Failed to parse inspection state:', e);
    return null;
  }
}

export function saveInspectionState(state: InspectionState) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function updateItemStatus(
  state: InspectionState,
  section: string,
  item: string,
  status: InspectionStatus,
  note?: string
): InspectionState {
  const updated = { ...state };
  const result = updated.sections?.[section]?.[item];
  if (!result) return state;

  result.status = status;
  if (note) {
    result.notes.push(note);
  }

  updated.updatedAt = new Date().toISOString();
  return updated;
}