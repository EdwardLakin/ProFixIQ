'use client';

import { useState } from 'react';
import {
  InspectionItem,
  InspectionSection,
  InspectionSession,
  InspectionTemplate,
  QuoteLine,
} from '@lib/inspection/types';
import { matchToMenuItem } from '@lib/quote/matchToMenuItem';

export default function useInspectionSession(initialSession?: Partial<InspectionSession>) {
  const [session, setSession] = useState<InspectionSession>(() => ({
    id: '',
    vehicleId: '',
    customerId: '',
    workOrderId: '',
    templateId: '',
    templateName: '',
    location: '',
    sections: [],
    currentSectionIndex: 0,
    currentItemIndex: 0,
    transcript: '',
    status: 'not_started',
    started: false,
    completed: false,
    quote: [],
    isListening: false,
    isPaused: false,
    updateItem: () => {}, // add a placeholder so type matches
    lastUpdated: new Date().toISOString(),
    ...initialSession,
  }));

  const updateInspection = (updates: Partial<InspectionSession>) => {
    setSession((prev) => ({
      ...prev,
      ...updates,
      lastUpdated: new Date().toISOString(),
    }));
  };

  const updateSection = (sectionIndex: number, updates: Partial<InspectionSection>) => {
    setSession((prev) => {
      const newSections = [...prev.sections];
      newSections[sectionIndex] = {
        ...newSections[sectionIndex],
        ...updates,
      };
      return {
        ...prev,
        sections: newSections,
        lastUpdated: new Date().toISOString(),
      };
    });
  };

  const updateItem = (
    sectionIndex: number,
    itemIndex: number,
    updates: Partial<InspectionItem>
  ) => {
    setSession((prev) => {
      const newSections = [...prev.sections];
      const section = newSections[sectionIndex];
      const items = [...section.items];
      const item = { ...items[itemIndex], ...updates };

      items[itemIndex] = item;
      section.items = items;
      newSections[sectionIndex] = section;

      const newQuote = [...prev.quote];
      const matched = matchToMenuItem(item.item, item);
      if (matched) {
        newQuote.push(matched);
      }

      return {
        ...prev,
        sections: newSections,
        quote: newQuote,
        lastUpdated: new Date().toISOString(),
      };
    });
  };

  const addQuoteLine = (line: QuoteLine) => {
    setSession((prev) => ({
      ...prev,
      quote: [...prev.quote, line],
      lastUpdated: new Date().toISOString(),
    }));
  };

  const startSession = (template: InspectionTemplate) => {
    setSession((prev) => ({
      ...prev,
      templateId: template.templateId,
      templateName: template.templateName,
      sections: template.sections,
      currentSectionIndex: 0,
      currentItemIndex: 0,
      transcript: '',
      started: true,
      completed: false,
      status: 'in_progress',
      isPaused: false,
      lastUpdated: new Date().toISOString(),
    }));
  };

  const pauseSession = () => {
    setSession((prev) => ({
      ...prev,
      isPaused: true,
      status: 'paused',
      lastUpdated: new Date().toISOString(),
    }));
  };

  const resumeSession = () => {
    setSession((prev) => ({
      ...prev,
      isPaused: false,
      status: 'in_progress',
      lastUpdated: new Date().toISOString(),
    }));
  };

  const finishSession = () => {
    setSession((prev) => ({
      ...prev,
      completed: true,
      status: 'completed',
      isPaused: false,
      lastUpdated: new Date().toISOString(),
    }));
  };

  return {
    session,
    updateInspection,
    updateSection,
    updateItem,
    addQuoteLine,
    startSession,
    pauseSession,
    resumeSession,
    finishSession,
    isPaused: session.isPaused,
  };
}