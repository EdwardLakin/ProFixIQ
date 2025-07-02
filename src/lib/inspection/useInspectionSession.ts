import { useState } from 'react';
import {
  InspectionItem,
  InspectionSession,
  InspectionTemplate,
  InspectionStatus,
  QuoteLine,
} from '@lib/inspection/types';

export default function useInspectionSession(template: InspectionTemplate) {
  const [session, setSession] = useState<InspectionSession>({
    id: '', // or generate a unique id
  vehicleId: '',
  customerId: '',
  workOrderId: '',
  templateId: template.templateId,
  templateName: template.templateName,
  sections: template.sections,
  currentSectionIndex: 0,
  currentItemIndex: 0,
  started: false,
  completed: false,
  isListening: false,
  isPaused: false,
  setIsListening: () => {},
  addQuoteLine: () => { },
  transcript: '',
  location: '',
  status: 'not_started',
  quote: [],
  });

  const updateInspection = (updates: Partial<InspectionSession>) => {
    setSession(prev => ({
      ...prev,
      ...updates,
    }));
  };

  const updateItem = (
    sectionIndex: number,
    itemIndex: number,
    updates: Partial<InspectionItem>
  ) => {
    const updatedSections = [...session.sections];
    const updatedItems = [...updatedSections[sectionIndex].items];
    updatedItems[itemIndex] = {
      ...updatedItems[itemIndex],
      ...updates,
    };
    updatedSections[sectionIndex] = {
      ...updatedSections[sectionIndex],
      items: updatedItems,
    };
    setSession(prev => ({
      ...prev,
      sections: updatedSections,
    }));
  };

  const updateSection = (
    sectionIndex: number,
    updates: Partial<InspectionSession['sections'][number]>
  ) => {
    const updatedSections = [...session.sections];
    updatedSections[sectionIndex] = {
      ...updatedSections[sectionIndex],
      ...updates,
    };
    setSession(prev => ({
      ...prev,
      sections: updatedSections,
    }));
  };

  const startSession = () => {
    setSession(prev => ({
      ...prev,
      status: 'in_progress',
      currentSectionIndex: 0,
      currentItemIndex: 0,
      transcript: '',
    }));
  };

  const finishSession = () => {
    setSession(prev => ({
      ...prev,
      status: 'completed',
    }));
  };

  const pauseSession = () => {
    setSession(prev => ({
      ...prev,
      isPaused: true,
      isListening: false,
    }));
  };

  const resumeSession = () => {
    setSession(prev => ({
      ...prev,
      isPaused: false,
      isListening: true,
    }));
  };

  const [isListening, setIsListening] = useState(false);

  const addQuoteLine = (line: QuoteLine) => {
  setSession((prev) => ({
    ...prev,
    quote: [...(prev.quote || []), line],
  }));
};
  return {
    session,
    updateInspection,
    startSession,
    finishSession,
    updateItem,
    updateSection,
    isListening,
    setIsListening,
    addQuoteLine
  };
}