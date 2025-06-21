
export function resetInspector(): InspectorState {
  return initializeInspector();
}import { updateInspectionItem, getInspectionState, setCurrentItemId } from './inspectionState';
import type { InspectionAction } from './types';

export function addItem(section: string, item: string, status?: string, notes?: string) {
  updateInspectionItem(section, item, { status, notes });
}

export function updateItem(section: string, item: string, updates: Partial<InspectionAction>) {
  updateInspectionItem(section, item, updates);
}

export function markItemNA(section: string, item: string) {
  updateInspectionItem(section, item, { status: 'N/A' });
}

export function markSectionNA(section: string) {
  const state = getInspectionState();
  const items = state.sections[section];
  if (items) {
    Object.keys(items).forEach((item) => {
      updateInspectionItem(section, item, { status: 'N/A' });
    });
  }
}

export function markComplete() {
  updateInspectionItem('meta', 'complete', { status: 'true' });
}

export function setCurrentItem(section: string, item: string) {
  setCurrentItemId(`${section}:${item}`);
}