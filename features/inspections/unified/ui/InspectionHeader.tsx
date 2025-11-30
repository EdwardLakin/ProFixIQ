"use client";

import React from "react";
import type { InspectionSession } from "@inspections/lib/inspection/types";

type Props = {
  session: InspectionSession;
};

export default function InspectionHeader({ session }: Props) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-white/10 bg-black/40 p-3 text-xs text-neutral-200">
      <div className="text-sm font-semibold text-orange-400">
        {session.templateName || "Inspection"}
      </div>
      <div>
        Vehicle:{" "}
        {session.vehicle?.year} {session.vehicle?.make}{" "}
        {session.vehicle?.model}
      </div>
      <div>Customer: {session.customer?.first_name} {session.customer?.last_name}</div>
      <div>Status: {session.status}</div>
    </div>
  );
}
