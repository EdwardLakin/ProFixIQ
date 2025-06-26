// lib/inspection/inspectionState.ts

import {
  InspectionSession,
  InspectionSection,
  InspectionItem,
} from '@lib/inspection/types';

export const defaultSession: InspectionSession = {
  templateName: '',
  startedAt: '',
  completed: false,
  sections: [],
};

export function initializeInspectionSession(
  templateName: string,
  sections: InspectionSection[]
): InspectionSession {
  return {
    templateName,
    startedAt: new Date().toISOString(),
    completed: false,
    sections,
  };
}

export function updateInspectionItemStatus(
  session: InspectionSession,
  sectionTitle: string,
  itemLabel: string,
  status: 'ok' | 'fail' | 'na',
  notes?: string
): InspectionSession {
  return {
    ...session,
    sections: session.sections.map((section) =>
      section.title === sectionTitle
        ? {
            ...section,
            items: section.items.map((item) =>
              item.name === itemLabel
                ? { ...item, status, notes: notes?.split(', ') }
                : item
            ),
          }
        : section
    ),
  };
}

export function completeInspection(
  session: InspectionSession
): InspectionSession {
  return {
    ...session,
    completed: true,
  };
}