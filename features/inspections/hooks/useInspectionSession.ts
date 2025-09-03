"use client";

import { useState } from "react";
import {
  BrakeType,
  InspectionItem,
  InspectionSection,
  InspectionSession,
  QuoteLine,
  QuoteLineItem,
} from "@inspections/lib/inspection/types";

/** Simple axle config used when starting a session */
type AxleLayoutConfig = { axleCount: number; brakeType: BrakeType };

/** Create axle measurement sections (CVIP-style) to prepend to the inspection */
function generateAxleSections(config: AxleLayoutConfig): InspectionSection[] {
  const { axleCount, brakeType } = config;
  const sections: InspectionSection[] = [];

  for (let i = 1; i <= axleCount; i += 1) {
    const title = `Axle ${i}`;
    const items: InspectionItem[] = [
      { item: "Left Tread Depth", name: "Left Tread Depth", value: null, unit: "mm", notes: "", photoUrls: [] },
      { item: "Right Tread Depth", name: "Right Tread Depth", value: null, unit: "mm", notes: "", photoUrls: [] },
      { item: "Left Tire Pressure", name: "Left Tire Pressure", value: null, unit: "psi", notes: "", photoUrls: [] },
      { item: "Right Tire Pressure", name: "Right Tire Pressure", value: null, unit: "psi", notes: "", photoUrls: [] },
      { item: "Left Lining Thickness", name: "Left Lining Thickness", value: null, unit: "mm", notes: "", photoUrls: [] },
      { item: "Right Lining Thickness", name: "Right Lining Thickness", value: null, unit: "mm", notes: "", photoUrls: [] },
      { item: "Wheel Torque", name: "Wheel Torque", value: null, unit: "ft lbs", notes: "", photoUrls: [] },
    ];

    if (brakeType === "air") {
      items.push(
        { item: "Left Push Rod Travel", name: "Left Push Rod Travel", value: null, unit: "in", notes: "", photoUrls: [] },
        { item: "Right Push Rod Travel", name: "Right Push Rod Travel", value: null, unit: "in", notes: "", photoUrls: [] },
      );
    }

    sections.push({ title, items });
  }

  return sections;
}

export default function useInspectionSession(initial?: Partial<InspectionSession>) {
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
    quote: [],
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
    ...initial,
  }));

  const stamp = <T extends object>(updates: T) => ({
    ...updates,
    lastUpdated: new Date().toISOString(),
  });

  const updateInspection = (updates: Partial<InspectionSession>) =>
    setSession(prev => ({ ...prev, ...stamp(updates) }));

  const updateSection = (sectionIndex: number, updates: Partial<InspectionSection>) =>
    setSession(prev => {
      const sections = [...prev.sections];
      sections[sectionIndex] = { ...sections[sectionIndex], ...updates };
      return { ...prev, ...stamp({ sections }) };
    });

  const updateItem = (sectionIndex: number, itemIndex: number, updates: Partial<InspectionItem>) =>
    setSession(prev => {
      const sections = [...prev.sections];
      const items = [...sections[sectionIndex].items];
      items[itemIndex] = { ...items[itemIndex], ...updates };
      sections[sectionIndex] = { ...sections[sectionIndex], items };
      return { ...prev, ...stamp({ sections }) };
    });

  /** Accepts either DB `QuoteLine` or UI `QuoteLineItem` */
  const addQuoteLine = (line: QuoteLine | QuoteLineItem) =>
    setSession(prev => ({ ...prev, ...stamp({ quote: [...(prev.quote || []), line] }) }));

  /** Accepts array of either type */
  const updateQuoteLines = (lines: (QuoteLine | QuoteLineItem)[]) =>
    setSession(prev => ({ ...prev, ...stamp({ quote: lines }) }));

  /**
   * Start / resume with axle presets if provided. New axle sections are
   * *prepended* above the rest of the template sections.
   */
  const startSession = (
    data: Partial<InspectionSession> & { axleConfig?: AxleLayoutConfig },
  ) => {
    const { axleConfig, ...rest } = data;
    const baseSections = data.sections ?? session.sections;

    const mergedSections =
      axleConfig && axleConfig.axleCount > 0
        ? [...generateAxleSections(axleConfig), ...baseSections]
        : baseSections;

    setSession(prev => ({
      ...prev,
      ...rest,
      ...stamp({
        sections: mergedSections,
        currentSectionIndex: 0,
        currentItemIndex: 0,
        transcript: "",
        started: true,
        completed: false,
        status: "in_progress",
        isPaused: false,
      }),
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
    startSession,
    pauseSession,
    resumeSession,
    finishSession,
    setIsListening,
    isPaused: session.isPaused,
  };
}