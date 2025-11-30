"use client";

import React from "react";
import type { InspectionSession } from "@inspections/lib/inspection/types";
import SectionRenderer from "./SectionRenderer";

type Props = {
  session: InspectionSession;
  onUpdateSession: (patch: Partial<InspectionSession>) => void;
};

export default function InspectionUnifiedScreen({ session, onUpdateSession }: Props) {
  // thin stub – we’ll wire real logic later
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-orange-400">
        Unified Inspection (beta)
      </h1>
      <SectionRenderer
        sections={session.sections ?? []}
        onUpdateItem={(sectionIndex, itemIndex, patch) => {
          const next = { ...(session as InspectionSession) };
          const sections = [...(next.sections ?? [])];
          if (!sections[sectionIndex]) return;
          const items = [...(sections[sectionIndex].items ?? [])];
          if (!items[itemIndex]) return;
          items[itemIndex] = { ...items[itemIndex], ...patch };
          sections[sectionIndex] = { ...sections[sectionIndex], items };
          onUpdateSession({ sections });
        }}
      />
    </div>
  );
}
