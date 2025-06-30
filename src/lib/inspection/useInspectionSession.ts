// src/lib/inspection/useInspectionSession.ts
import { useState } from 'react';
import {
  InspectionSession,
  InspectionSection,
  InspectionItem,
  QuoteLine,
  InspectionTemplate,
} from '@lib/inspection/types';
import { matchToMenuItem } from '@lib/quote/matchToMenuItem';
import { stringFromBase64URL } from '@supabase/ssr';

export default function useInspectionSession(template?: InspectionTemplate) {
  const [session, setSession] = useState<InspectionSession>({
    vehicleId: '',
    customerId: '',
    workOrderId: '',
    templateId: template?.templateId || '',
    templateName: template?.templateName || '',
    sections: template?.sections || [],
    currentSectionIndex: 0,
    currentItemIndex: 0,
    started: false,
    completed: false,
    status: 'not_started',
    transcript: '',
    isListening: false,
    isPaused: false,
    location: '',
    quote: [],
  });

  const updateInspection = (updated: Partial<InspectionSession>) => {
    setSession((prev) => ({ ...prev, ...updated }));
  };

  const updateSection = (updates: Partial<InspectionSection>, index: number) => {
    const updatedSections = [...session.sections];
    updatedSections[index] = { ...updatedSections[index], ...updates };
    setSession((s) => ({ ...s, sections: updatedSections }));
  };

  const updateItem = ({
    sectionIndex,
    itemIndex,
    updates,
  }: {
    sectionIndex: number;
    itemIndex: number;
    updates: Partial<InspectionItem>;
  }) => {
    const updatedSections = [...session.sections];
    const updatedItems = [...updatedSections[sectionIndex].items];
    updatedItems[itemIndex] = { ...updatedItems[itemIndex], ...updates };
    updatedSections[sectionIndex] = {
      ...updatedSections[sectionIndex],
      items: updatedItems,
    };
    setSession((s) => ({ ...s, sections: updatedSections }));
  };

  const startSession = () => {
    setSession((s) => ({
      ...s,
      started: true,
      status: 'in_progress',
    }));
  };

  const finishSession = () => {
    setSession((s) => ({
      ...s,
      completed: true,
      status: 'completed',
    }));
  };

  const pauseSession = () => {
    setSession((s) => ({ ...s, isPaused: true }));
  };

  const resumeSession = () => {
    setSession((s) => ({ ...s, isPaused: false }));
  };

  const nextItem = () => {
    const { sections } = session;

    for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
      const items = sections[sectionIndex].items;
      for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
        const item = items[itemIndex];
        if (
          item.status !== 'ok' &&
          (!item.note || !item.value || !item.photoUrls?.length || !item.recommend?.length)
        ) {
          setSession((s) => ({
            ...s,
            location: `${sectionIndex}->${itemIndex}`,
          }));
          return;
        }
      }
    }

    setSession((s) => ({ ...s, status: 'ready_for_review' }));
  };

  const addQuoteLine = (item: InspectionItem, section: string) => {
    const matched = matchToMenuItem(item as any, section as any);
    const quoteLine: QuoteLine = {
      id: crypto.randomUUID(),
      inspectionItemId: item.item || '',
      item: item.item || '',
      status: item.status || 'fail',
      notes: item.note || '',
      description: '',
      value: '',
      laborTime: matched?.laborTime || 1,
      laborRate: matched?.laborRate || 100,
      parts: matched?.parts || [],
      totalCost: matched?.parts?.reduce((sum, part) => sum + (part.price || 0), 0) || 0,
      editable: true,
    };

    setSession((prev) => ({
      ...prev,
      quote: [
        ...(prev.quote ?? []),
        {
          ...quoteLine,
          item,
          inspectionItemId: item.item || '',
          status: item.status || 'fail',
          section,
        } as any,
      ],
    }));
  };

  return {
    session,
    updateInspection,
    updateSection,
    updateItem,
    finishSession,
    pauseSession,
    resumeSession,
    startSession,
    nextItem,
    setSession,
    addQuoteLine,
  };
}