"use client";

import { useState } from "react";
import type { InspectionSession } from "@inspections/lib/inspection/types";

export default function useUnifiedInspection(initial: InspectionSession) {
  const [session, setSession] = useState<InspectionSession>(initial);

  const updateSession = (patch: Partial<InspectionSession>) =>
    setSession((prev) => ({ ...prev, ...patch }));

  return {
    session,
    updateSession,
  };
}
