import { useState } from 'react';
import {
  InspectionItem,
  InspectionSection,
  InspectionSession,
  InspectionStatus,
  InspectionTemplate,
} from './types';

export default function useInspectionSession(template?: InspectionTemplate) {
 const initialSession: InspectionSession = {
  templateName: template?.templateName || '',
  vehicleId: '',
  customerId: '',
  location: '',
  started: false,
  isListening: false,
  isPaused: false,
  completed: false,
  currentSectionIndex: 0,
  transcript: '',
  status: 'not_started',
  sections: template?.sections?.map((section, sIndex) => ({
    section: section.section,
    id: section.id || `section-${sIndex}`,
    items: section.items.map((item) => ({
      item: item.item,
      status: 'ok',
      notes: '',
      value: undefined,
      unit: '',
      photoUrls: [],
      recommend: [],
    })),
  })) || [],
};

  const [session, setSession] = useState<InspectionSession>(initialSession);

  const updateItem = (
    sectionIndex: number,
    itemIndex: number,
    updatedItem: Partial<InspectionItem>
  ) => {
    setSession((prev) => {
      const updatedSections = [...prev.sections];
      const section = updatedSections[sectionIndex];
      if (!section) return prev;

      const updatedItems = [...section.items];
      updatedItems[itemIndex] = {
        ...updatedItems[itemIndex],
        ...updatedItem,
      };

      updatedSections[sectionIndex] = {
        ...section,
        items: updatedItems,
      };

      return {
        ...prev,
        sections: updatedSections,
      };
    });
  };

  const updateSessionStatus = (newStatus: InspectionStatus) => {
    setSession((prev) => ({
      ...prev,
      status: newStatus,
    }));
  };

  return {
    session,
    setSession,
    updateItem,
    updateSessionStatus,
  };
}