'use client';

import { useState } from 'react';
import {
  InspectionItem,
  InspectionSection,
  InspectionSession,
  QuoteLine,
} from '@lib/inspection/types';

export default function useInspectionSession(initialSession?: Partial<InspectionSession>) {
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
      postal_code: '',
    },
    vehicle: {
      year: '',
      make: '',
      model: '',
      vin: '',
      license_plate: '',
      mileage: '',
      color: '',
    },
    sections: [],
    updateItem: () => {},
    onStart: () => {},
    onPause: () => {},
    onResume: () => {},
    ...initialSession,
  }));

  // Core Update Functions
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

  const updateItem = (sectionIndex: number, itemIndex: number, updates: Partial<InspectionItem>) => {
    setSession((prev) => {
      const newSections = [...prev.sections];
      const items = [...newSections[sectionIndex].items];
      items[itemIndex] = {
        ...items[itemIndex],
        ...updates,
      };
      newSections[sectionIndex] = {
        ...newSections[sectionIndex],
        items,
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

  // Session Lifecycle Functions
  const startSession = (sessionData: Partial<InspectionSession>) => {
    const newSession: InspectionSession = {
      ...session,
      ...sessionData,
      sections:
        sessionData.sections && sessionData.sections.length > 0
          ? sessionData.sections
          : session.sections,
      currentSectionIndex: 0,
      currentItemIndex: 0,
      transcript: '',
      started: true,
      completed: false,
      status: 'in_progress',
      isPaused: false,
      lastUpdated: new Date().toISOString(),
      updateItem,
      onStart: () => {},
      onPause: () => {},
      onResume: () => {},
    };

    setSession(newSession);
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

  const setIsListening = (value: boolean) => {
    setSession((prev) => ({
      ...prev,
      isListening: value,
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
    onPause: () => pauseSession(),
    onResume: () => resumeSession(),
  };
}