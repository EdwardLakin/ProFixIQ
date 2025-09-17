"use client";

import { createContext, useContext } from "react";
import type { InspectionItem } from "@inspections/lib/inspection/types";

export type InspectionFormCtxValue = {
  updateItem: (
    sectionIdx: number,
    itemIdx: number,
    patch: Partial<InspectionItem>
  ) => void;
};

export const InspectionFormCtx = createContext<InspectionFormCtxValue | null>(null);

export function useInspectionForm() {
  const ctx = useContext(InspectionFormCtx);
  if (!ctx) throw new Error("useInspectionForm must be used inside <InspectionFormCtx.Provider>");
  return ctx;
}