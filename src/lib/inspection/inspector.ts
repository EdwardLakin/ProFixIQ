import type {
  InspectionItem,
  InspectionActions,
  InspectionAction,
  InspectionState,
} from './types';

let inspectionDraft: Record<string, Record<string, InspectionItem>> = {};
let inspectionActions: InspectionActions = [];
let isPaused = false;
let isComplete = false;
let transcriptLog: string[] = [];
let currentItemId: string | null = null;

export function resetInspectionState() {
  inspectionDraft = {};
  inspectionActions = [];
  isPaused = false;
  isComplete = false;
  transcriptLog = [];
  currentItemId = null;
}

export function getInspectionState(): InspectionState {
  return {
    sections: inspectionDraft,
    transcriptLog,
    paused: isPaused,
    currentItemId,
  };
}

export function createInspection() {
  inspectionDraft = {};
  inspectionActions = [];
  isPaused = false;
  isComplete = false;
  transcriptLog = [];
  currentItemId = null;
}

export function addItem(
  section: string,
  item: string,
  status: string,
  notes?: string,
  measurement?: string,
  measurement2?: string
) {
  if (!inspectionDraft[section]) {
    inspectionDraft[section] = {};
  }

  inspectionDraft[section][item] = {
    status: status as InspectionItem['status'],
    notes,
    measurement,
    measurement2,
  };

  inspectionActions.push({
    type: 'add',
    section,
    item,
    status,
    notes,
    measurement,
    measurement2,
  });
}

export function markSectionNA(section: string) {
  if (!inspectionDraft[section]) {
    inspectionDraft[section] = {};
  }

  for (const item in inspectionDraft[section]) {
    inspectionDraft[section][item] = { status: 'na' };
  }

  inspectionActions.push({
    type: 'na',
    section,
  });
}

export function pauseInspection() {
  isPaused = true;
}

export function resumeInspection() {
  isPaused = false;
}

export function completeInspection() {
  isComplete = true;
}

export function unloadLast() {
  const last = inspectionActions.pop();
  if (!last) return;

  if (last.type === 'add') {
    const { section, item } = last;
    delete inspectionDraft[section]?.[item];
  }

  if (last.type === 'na') {
    const { section } = last;
    delete inspectionDraft[section];
  }
}