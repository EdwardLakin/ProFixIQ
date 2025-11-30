"use client";

import React from "react";
import type { InspectionSession } from "@inspections/lib/inspection/types";

type Props = {
  session: InspectionSession;
};

export default function InspectionSummary({ session }: Props) {
  const sections = session.sections ?? [];
  const totalItems = sections.reduce(
    (sum, s) => sum + (s.items?.length ?? 0),
    0,
  );

  return (
    <div className="rounded-xl border border-white/10 bg-black/40 p-3 text-xs text-neutral-200">
      <div className="mb-1 text-sm font-semibold text-orange-400">
        Quick summary
      </div>
      <div>Sections: {sections.length}</div>
      <div>Items: {totalItems}</div>
      <div>Status: {session.status}</div>
    </div>
  );
}
