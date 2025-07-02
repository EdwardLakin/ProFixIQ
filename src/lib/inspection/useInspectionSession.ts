import { useState } from 'react';
import {
  InspectionSession,
  InspectionTemplate,
  InspectionItem,
} from '@lib/inspection/types';

export default function useInspectionSession(
  template: InspectionTemplate,
  templateName: string
) {
  const [session, setSession] = useState<InspectionSession>({
    templateId: template.templateId,
    templateName,
    vehicleId: '',
    customerId: '',
    workOrderId: '',
    location: '',
    status: 'not_started',
    isListening: false,
    isPaused: false,
    transcript: '',
    currentSectionIndex: 0,
    currentItemIndex: 0,
    sections: template.sections,
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
      started: true,
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

  return {
    session,
    updateInspection,
    updateItem,
    updateSection,
    startSession,
    finishSession,
    pauseSession,
    resumeSession,
  };
}