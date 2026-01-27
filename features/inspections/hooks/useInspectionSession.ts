//features/inspections/hooks/useInspectionSession.ts

"use client";

import { useState } from "react";
import {
  InspectionItem,
  InspectionSection,
  InspectionSession,
  QuoteLineItem,      // ⬅️ use only QuoteLineItem here
  BrakeType,
} from "@inspections/lib/inspection/types";

type AxleLayoutConfig = { axleCount: number; brakeType: BrakeType };

function generateAxleSections({ axleCount, brakeType }: AxleLayoutConfig): InspectionSection[] {
  const sections: InspectionSection[] = [];

  for (let i = 1; i <= axleCount; i++) {
    const title = `Axle ${i}`;
    const items: InspectionItem[] = [
      { item: "Left Tread Depth",  name: "Left Tread Depth",  value: null, unit: "mm",  notes: "",  photoUrls: [] },
      { item: "Right Tread Depth", name: "Right Tread Depth", value: null, unit: "mm",  notes: "",  photoUrls: [] },
      { item: "Left Tire Pressure",  name: "Left Tire Pressure",  value: null, unit: "psi", notes: "", photoUrls: [] },
      { item: "Right Tire Pressure", name: "Right Tire Pressure", value: null, unit: "psi", notes: "", photoUrls: [] },
      { item: "Left Lining Thickness",  name: "Left Lining Thickness",  value: null, unit: "mm", notes: "", photoUrls: [] },
      { item: "Right Lining Thickness", name: "Right Lining Thickness", value: null, unit: "mm", notes: "", photoUrls: [] },
      { item: "Wheel Torque", name: "Wheel Torque", value: null, unit: "ft lbs", notes: "", photoUrls: [] },
    ];

    if (brakeType === "air") {
      items.push(
        { item: "Left Push Rod Travel",  name: "Left Push Rod Travel",  value: null, unit: "in", notes: "", photoUrls: [] },
        { item: "Right Push Rod Travel", name: "Right Push Rod Travel", value: null, unit: "in", notes: "", photoUrls: [] },
      );
    }

    sections.push({ title, items });
  }

  return sections;
}

export default function useInspectionSession(initialSession?: Partial<InspectionSession>) {
  const [session, setSession] = useState<InspectionSession>(() => ({
    id: "",
    vehicleId: "",
    customerId: "",
    workOrderId: "",
    templateId: "",
    templateName: "",
    location: "",
    currentSectionIndex: 0,
    currentItemIndex: 0,
    transcript: "",
    status: "not_started",
    started: false,
    completed: false,
    isListening: false,
    isPaused: false,
    quote: [],                                 // ⬅️ QuoteLineItem[]
    lastUpdated: new Date().toISOString(),
    customer: {
      first_name: "",
      last_name: "",
      phone: "",
      email: "",
      address: "",
      city: "",
      province: "",
      postal_code: "",
    },
    vehicle: {
      year: "",
      make: "",
      model: "",
      vin: "",
      license_plate: "",
      mileage: "",
      color: "",
    },
    sections: [],
    ...initialSession,
  }));

  const stamp = () => ({ lastUpdated: new Date().toISOString() });

  const updateInspection = (updates: Partial<InspectionSession>) =>
    setSession(prev => ({ ...prev, ...updates, ...stamp() }));

  const updateSection = (sectionIndex: number, updates: Partial<InspectionSection>) =>
    setSession(prev => {
      const sections = [...prev.sections];
      sections[sectionIndex] = { ...sections[sectionIndex], ...updates };
      return { ...prev, sections, ...stamp() };
    });

  const updateItem = (sectionIndex: number, itemIndex: number, updates: Partial<InspectionItem>) =>
    setSession(prev => {
      const sections = [...prev.sections];
      const items = [...sections[sectionIndex].items];
      items[itemIndex] = { ...items[itemIndex], ...updates };
      sections[sectionIndex] = { ...sections[sectionIndex], items };
      return { ...prev, sections, ...stamp() };
    });

  // ✅ strictly QuoteLineItem (the normalized/store+PDF shape)
  const addQuoteLine = (line: QuoteLineItem) =>
    setSession(prev => ({ ...prev, quote: [...(prev.quote ?? []), line], ...stamp() }));

  const updateQuoteLines = (lines: QuoteLineItem[]) =>
    setSession(prev => ({ ...prev, quote: lines, ...stamp() }));

  // ✅ targeted updater for enriching a single line (AI merge, edits, etc.)
  const updateQuoteLine = (id: string, patch: Partial<QuoteLineItem>) =>
    setSession(prev => ({
      ...prev,
      quote: (prev.quote ?? []).map((l) => (l.id === id ? { ...l, ...patch } : l)),
      ...stamp(),
    }));

  const startSession = (sessionData: Partial<InspectionSession> & { axleConfig?: AxleLayoutConfig }) => {
    const { axleConfig, ...rest } = sessionData;
    const newSections =
      axleConfig?.axleCount && axleConfig?.brakeType
        ? generateAxleSections(axleConfig)
        : sessionData.sections || session.sections;

    setSession(prev => ({
      ...prev,
      ...rest,
      sections: newSections,
      currentSectionIndex: 0,
      currentItemIndex: 0,
      transcript: "",
      started: true,
      completed: false,
      status: "in_progress",
      isPaused: false,
      ...stamp(),
    }));
  };

  const pauseSession  = () => updateInspection({ isPaused: true,  status: "paused" });
  const resumeSession = () => updateInspection({ isPaused: false, status: "in_progress" });
  const finishSession = () => updateInspection({ completed: true, status: "completed", isPaused: false });
  const setIsListening = (value: boolean) => updateInspection({ isListening: value });

  return {
    session,
    updateInspection,
    updateSection,
    updateItem,
    addQuoteLine,
    updateQuoteLines,
    updateQuoteLine,   // ⬅️ expose the targeted updater
    startSession,
    pauseSession,
    resumeSession,
    finishSession,
    setIsListening,
    isPaused: session.isPaused,
  };
}