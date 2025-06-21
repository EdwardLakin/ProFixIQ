import type { InspectionState } from './types';
import { saveDraft } from './saveDraft';

export function syncState(state: InspectionState) {
  // You can later enhance this to include remote syncing if needed
  saveDraft(state);
}