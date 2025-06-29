// lib/inspection/inspectionState.ts
import type {
  InspectionSession,
  InspectionSection,
  InspectionItem,
  InspectionStatus,
} from '@lib/inspection/types';

export const defaultInspectionSession: InspectionSession = {
  vehicleId: '',
  customerId: '',
  templateName: '',
  sections: [],
  currentSectionIndex: 0,
  started: false,
  completed: false,
  isPaused: false,
  isListening: false,
  transcript: '',
  status: 'in_progress',
};

export function initializeInspectionSession(
  vehicleId: string,
  customerId: string,
  templateName: string,
  sections: InspectionSection[]
): InspectionSession {
  return {
    vehicleId,
    customerId,
    templateName,
    sections,
    currentSectionIndex: 0,
    started: false,
    completed: false,
    isPaused: false,
    isListening: false,
    transcript: '',
    status: 'in_progress',
  };
}

export function updateInspectionItemStatus(
  session: InspectionSession,
  sectionLabel: string,
  itemLabel: string,
  status: 'ok' | 'fail' | 'na',
  notes?: string,
  photoUrls?: string[]
): InspectionSession {
  const updatedSections = session.sections.map((section) => {
    if (section.section !== sectionLabel) return section;

    const updatedItems = section.items.map((item) => {
      if (item.item !== itemLabel) return item;
      return {
        ...item,
        status,
        note: notes ?? item.note,
        photoUrls: photoUrls ?? item.photoUrls,
      };
    });

    return {
      ...section,
      items: updatedItems,
    };
  });

  return {
    ...session,
    sections: updatedSections,
  };
}

export function completeInspection(session: InspectionSession): InspectionSession {
  return {
    ...session,
    completed: true,
    status: 'completed' as InspectionStatus,
  };
}