// /features/inspections/lib/inspections/ui/InspectionFormContext.tsx
"use client";

import { createContext, useContext } from "react";
import type { InspectionItem, InspectionSection } from "@inspections/lib/inspection/types";

// Update a single item in a section
export type UpdateItemFn = (
  sectionIdx: number,
  itemIdx: number,
  patch: Partial<InspectionItem>,
) => void;

// Update a section (title and/or items array) - REQUIRED for dynamic grids (BatteryGrid / AddAxle)
export type UpdateSectionFn = (
  sectionIdx: number,
  patch: Partial<Pick<InspectionSection, "title" | "items">>,
) => void;

// Optional helper (safe read)
export type GetSectionFn = (sectionIdx: number) => InspectionSection | null;

type Ctx = {
  updateItem: UpdateItemFn;

  /**
   * Needed for grids that add/remove items (BatteryGrid, AddAxle).
   * Your provider must implement this and pass it in.
   */
  updateSection?: UpdateSectionFn;

  /**
   * Optional helper for components that need to inspect the live section.
   */
  getSection?: GetSectionFn;
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