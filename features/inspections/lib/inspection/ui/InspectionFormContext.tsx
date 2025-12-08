//features/inspections/lib/inspections/ui/InspectionFormContext.tsx

"use client";

import { createContext, useContext } from "react";
import type { InspectionItem } from "@inspections/lib/inspection/types";

// The shape of the context value (includes a function—totally fine here)
export type UpdateItemFn = (
  sectionIdx: number,
  itemIdx: number,
  patch: Partial<InspectionItem>
) => void;

type Ctx = {
  updateItem: UpdateItemFn;
};

// Export the context itself (no wrapper component!)
export const InspectionFormCtx = createContext<Ctx | null>(null);

export function useInspectionForm(): Ctx {
  const ctx = useContext(InspectionFormCtx);
  if (!ctx) {
    throw new Error("useInspectionForm must be used inside <InspectionFormCtx.Provider>");
  }
  return ctx;
}