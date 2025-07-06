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

export default function useInspectionSession( initialSession?: Partial<InspectionSession>, p1?: { title: string; items: { name: string; status: string; notes: string; }[]; }, p2?: { title: string; items: ({ name: string; status: string; notes: string; unit?: undefined; value?: undefined; } | { name: string; status: string; unit: string; value: string; notes: string; })[]; }, p3?: { title: string; items: ({ name: string; status: string; unit: string; value: string; notes: string; } | { name: string; status: string; notes: string; unit?: undefined; value?: undefined; })[]; }, p4?: { title: string; items: { name: string; status: string; unit: string; value: string; notes: string; }[]; }, p5?: { title: string; items: { name: string; status: string; notes: string; }[]; }, p6?: { title: string; items: { name: string; status: string; notes: string; }[]; }, p7?: { title: string; items: { name: string; status: string; notes: string; }[]; }) {
  const [session, setSession] = useState<InspectionSession>(() => ({
  id: '',
  vehicleId: '',
  customerId: '',
  workOrderId: '',
  templateId: '',
  templateName: '',
  location: '',
  currentSectionIndex: 0,
  currentItemIndex: 0,
  transcript: '',
  status: 'not_started',
  started: false,
  completed: false,
  isListening: false,
  isPaused: false,
  quote: [],
  lastUpdated: new Date().toISOString(),
  customer: {
    first_name: '',
    last_name: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    province: '',
    postal_code: ''
  },
  vehicle: {
    year: '',
    make: '',
    model: '',
    vin: '',
    license_plate: '',
    mileage: '',
    color: ''
  },
  sections: [],
updateItem: () => {},
onStart: () => {},
onPause: () => {},
onResume: () => {},
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
    const updatedSection = {
      ...newSections[sectionIndex],
      ...updates,
    };
    newSections[sectionIndex] = updatedSection;

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
    const newItems = [...newSections[sectionIndex].items];
    const updatedItem = {
      ...newItems[itemIndex],
      ...updates,
    };
    newItems[itemIndex] = updatedItem;
    newSections[sectionIndex] = {
      ...newSections[sectionIndex],
      items: newItems,
    };

    return {
      ...prev,
      sections: newSections,
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

  const setIsListening = (value: boolean) => {
  setSession((prev) => ({
    ...prev,
    isListening: value,
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
  setIsListening,
  isPaused: session.isPaused,
  onPause: () => {
    setSession((prev) => ({ ...prev, isPaused: true, status: 'paused' }));
  },
  onResume: () => {
    setSession((prev) => ({ ...prev, isPaused: false, status: 'in_progress' }));
  },
};
}