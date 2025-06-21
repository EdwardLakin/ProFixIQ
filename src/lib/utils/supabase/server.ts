import type { InspectionState } from './types';

let serverDraft: InspectionState | null = null;

export function saveToServer(state: InspectionState) {
  serverDraft = JSON.parse(JSON.stringify(state));
}

export function loadFromServer(): InspectionState | null {
  return serverDraft ? JSON.parse(JSON.stringify(serverDraft)) : null;
}