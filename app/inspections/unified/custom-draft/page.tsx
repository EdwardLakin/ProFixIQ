"use client";

import React, { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import type {
  InspectionSession,
  InspectionSection,
} from "@inspections/lib/inspection/types";
import InspectionUnifiedScreen from "@inspections/unified/ui/InspectionUnifiedScreen";

type DutyClass = "light" | "medium" | "heavy" | null;

function loadSectionsFromSessionStorage(): {
  sections: InspectionSection[] | null;
  title: string;
  dutyClass: DutyClass;
} {
  if (typeof window === "undefined") {
    return { sections: null, title: "Custom Inspection", dutyClass: null };
  }

  const rawSections = window.sessionStorage.getItem(
    "customInspection:sections",
  );
  const title =
    window.sessionStorage.getItem("customInspection:title") ||
    "Custom Inspection";

  const dutyRaw =
    window.sessionStorage.getItem("customInspection:dutyClass") || null;
  const dutyClass = (dutyRaw as DutyClass) ?? null;

  if (!rawSections) {
    return { sections: null, title, dutyClass };
  }

  try {
    const parsed = JSON.parse(rawSections) as InspectionSection[];
    return { sections: parsed ?? [], title, dutyClass };
  } catch {
    return { sections: null, title, dutyClass };
  }
}

export default function CustomDraftPage() {
  const sp = useSearchParams();
  const [session, setSession] = useState<InspectionSession | null>(null);

  useEffect(() => {
    const { sections, title, dutyClass } = loadSectionsFromSessionStorage();
    if (!sections || sections.length === 0) {
      setSession(null);
      return;
    }

    const workOrderId = sp.get("workOrderId") ?? null;

    const initial: InspectionSession = {
      id: undefined,
      templateId: null,
      templateName: title,
      templateitem: title,
      workOrderId,
      // no workOrderLineId here – this is a free-floating custom draft
      brakeType: undefined,
      meta: {
        dutyClass: (sp.get("dutyClass") as DutyClass) ?? dutyClass,
        source: "custom-builder",
      },

      currentSectionIndex: 0,
      currentItemIndex: 0,

      status: "in_progress",
      started: true,
      completed: false,
      isPaused: false,

      // voice state
      transcript: "",
      isListening: false,

      // entities – we don’t show customer/vehicle on this screen
      customer: null,
      vehicle: null,

      sections,
      quote: [],
    };

    setSession(initial);
  }, [sp]);

  const handleUpdateSession = (patch: Partial<InspectionSession>) => {
    setSession((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-sm text-neutral-300">
        <div className="rounded-2xl border border-white/10 bg-neutral-950/80 px-5 py-4 shadow-[0_22px_55px_rgba(0,0,0,0.95)]">
          No custom inspection draft found. Go back to{" "}
          <span className="font-medium text-orange-400">Build Custom Inspection</span>{" "}
          and generate one with AI or manual selections.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.16),#020617_90%)] px-4 py-6 text-white">
      <div className="mx-auto w-full max-w-5xl rounded-2xl border border-white/10 bg-black/40 p-4 shadow-[0_22px_55px_rgba(0,0,0,0.95)] backdrop-blur">
        <InspectionUnifiedScreen
          session={session}
          onUpdateSession={handleUpdateSession}
        />
      </div>
    </div>
  );
}