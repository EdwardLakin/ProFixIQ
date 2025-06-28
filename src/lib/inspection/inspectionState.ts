// src/lib/inspection/inspectionState.ts
import type {
  InspectionSession,
  InspectionSection,
  InspectionItem,
} from '@lib/inspection/types';

export const defaultInspectionSession: InspectionSession = {
  vehicleId: '',
  customerId: '',
  templateName: '',
  sections: [],
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
    status: 'in_progress',
  };
}

export function updateInspectionItemStatus(
  session: InspectionSession,
  sectionLabel: string,
  itemLabel: string,
  status: 'ok' | 'fail' | 'na',
  notes?: string
): InspectionSession {
  const updatedSections = session.sections.map((section) => {
    if (section.section !== sectionLabel) return section;

    const updatedItems = section.items.map((item) => {
      if (item.item !== itemLabel) return item;

      return {
        ...item,
        status,
        notes: notes ?? '',
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
    status: 'completed',
  };
}