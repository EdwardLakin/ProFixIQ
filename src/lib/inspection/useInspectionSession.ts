'use client';

import { useState } from 'react';
import {
  InspectionTemplate,
  InspectionSession,
  InspectionItem,
  InspectionSection,
  QuoteLine,
} from '@lib/inspection/types';
import { matchToMenuItem } from '@lib/quote/matchToMenuItem';

export default function useInspectionSession(template: InspectionTemplate) {
  const [session, setSession] = useState<InspectionSession>({
    vehicleId: '',
    customerId: '',
    workOrderId: '',
    templateName: template.templateName || '',
    sections: template.sections,
    currentSectionIndex: 0,
    started: false,
    completed: false,
    isPaused: false,
    isListening: false,
    transcript: '',
    status: 'not_started',
    location: '',
    quote: [],
  });

  const updateInspection = (updated: Partial<InspectionSession>) => {
    setSession(prev => ({ ...prev, ...updated }));
  };

  function updateSection(updates: Partial<InspectionSection>, index: number) {
    const updatedSections = [...session.sections];
    updatedSections[index] = { ...updatedSections[index], ...updates };
    setSession({ ...session, sections: updatedSections });
  }

  const updateItem = (sectionIndex: number, itemIndex: number, updates: Partial<InspectionItem>) => {
    const updatedSections = [...session.sections];
    const section = updatedSections[sectionIndex];
    const updatedItems = [...section.items];
    updatedItems[itemIndex] = { ...updatedItems[itemIndex], ...updates };
    updatedSections[sectionIndex] = { ...section, items: updatedItems };
    setSession({ ...session, sections: updatedSections });
  };

  const startSession = () => {
    setSession({
      ...session,
      started: true,
      status: 'in_progress',
      currentSectionIndex: 0,
    });
  };

  const finishSession = () => {
    setSession({
      ...session,
      completed: true,
      status: 'completed',
    });
  };

  const addQuoteLine = (item: InspectionItem, section: string) => {
  const matched = matchToMenuItem(item.item || '', item);

  const quoteLine: QuoteLine = {
    id: crypto.randomUUID(),
    inspectionItemId: item.item || '',
    item: item.item || '',
    status: item.status || 'fail',
    value: item.item || '',
    notes: item.note || '',
    laborTime: matched?.laborTime || 1,
    laborRate: matched?.laborRate || 100,
    parts: matched?.parts || [],
    totalCost: matched?.parts?.reduce((sum, part) => sum + (part.price || 0), 0) || 0,
    editable: true,
  };

  setSession
};

  return {
    session,
    updateInspection,
    updateSection,
    updateItem,
    startSession,
    finishSession,
    addQuoteLine,
  };
}
