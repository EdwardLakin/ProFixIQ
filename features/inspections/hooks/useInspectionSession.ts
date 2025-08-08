"use client";

import { useState } from "react";
import {
  InspectionItem,
  InspectionSection,
  InspectionSession,
  QuoteLine,
  BrakeType,
} from "@shared/lib/inspection/types";

type AxleLayoutConfig = {
  axleCount: number;
  brakeType: BrakeType;
};

function generateAxleSections({
  axleCount,
  brakeType,
}: AxleLayoutConfig): InspectionSection[] {
  const sections: InspectionSection[] = [];

  for (let i = 1; i <= axleCount; i++) {
    const title = `Axle ${i}`;

    const items: InspectionItem[] = [
      {
        name: "Left Tread Depth",
        value: null,
        unit: "mm",
        notes: "",
        status: "",
        photoUrls: [],
        item: "",
      },
      {
        name: "Right Tread Depth",
        value: null,
        unit: "mm",
        notes: "",
        status: "",
        photoUrls: [],
        item: "",
      },
      {
        name: "Left Tire Pressure",
        value: null,
        unit: "psi",
        notes: "",
        status: "",
        photoUrls: [],
        item: "",
      },
      {
        name: "Right Tire Pressure",
        value: null,
        unit: "psi",
        notes: "",
        status: "",
        photoUrls: [],
        item: "",
      },
      {
        name: "Left Lining Thickness",
        value: null,
        unit: "mm",
        notes: "",
        status: "",
        photoUrls: [],
        item: "",
      },
      {
        name: "Right Lining Thickness",
        value: null,
        unit: "mm",
        notes: "",
        status: "",
        photoUrls: [],
        item: "",
      },
      {
        name: "Wheel Torque",
        value: null,
        unit: "ft lbs",
        notes: "",
        status: "",
        photoUrls: [],
        item: "",
      },
    ];

    if (brakeType === "air") {
      items.push(
        {
          name: "Left Push Rod Travel",
          value: null,
          unit: "in",
          notes: "",
          status: "",
          photoUrls: [],
          item: "",
        },
        {
          name: "Right Push Rod Travel",
          value: null,
          unit: "in",
          notes: "",
          status: "",
          photoUrls: [],
          item: "",
        },
      );
    }

    sections.push({ title, items });
  }

  return sections;
}

export default function useInspectionSession(
  initialSession?: Partial<InspectionSession>,
) {
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
    updateItem: () => {},
    onStart: () => {},
    onPause: () => {},
    onResume: () => {},
    ...initialSession,
  }));

  const updateInspection = (updates: Partial<InspectionSession>) => {
    setSession((prev) => ({
      ...prev,
      ...updates,
      lastUpdated: new Date().toISOString(),
    }));
  };

  const updateSection = (
    sectionIndex: number,
    updates: Partial<InspectionSection>,
  ) => {
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
    updates: Partial<InspectionItem>,
  ) => {
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

  const updateQuoteLines = (quoteLines: QuoteLine[]) => {
    setSession((prev) => ({
      ...prev,
      quote: quoteLines,
      lastUpdated: new Date().toISOString(),
    }));
  };

  const startSession = (
    sessionData: Partial<InspectionSession> & { axleConfig?: AxleLayoutConfig },
  ) => {
    const { axleConfig, ...rest } = sessionData;

    const newSections =
      axleConfig?.axleCount && axleConfig?.brakeType
        ? generateAxleSections(axleConfig)
        : sessionData.sections || session.sections;

    const newSession: InspectionSession = {
      ...session,
      ...rest,
      sections: newSections,
      currentSectionIndex: 0,
      currentItemIndex: 0,
      transcript: "",
      started: true,
      completed: false,
      status: "in_progress",
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
      status: "paused",
      lastUpdated: new Date().toISOString(),
    }));
  };

  const resumeSession = () => {
    setSession((prev) => ({
      ...prev,
      isPaused: false,
      status: "in_progress",
      lastUpdated: new Date().toISOString(),
    }));
  };

  const finishSession = () => {
    setSession((prev) => ({
      ...prev,
      completed: true,
      status: "completed",
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
    updateQuoteLines,
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
