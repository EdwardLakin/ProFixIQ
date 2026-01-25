"use client";

import { createContext, useContext } from "react";
import type { InspectionItem, InspectionSection } from "@inspections/lib/inspection/types";

/**
 * Update a single item within a section.
 */
export type UpdateItemFn = (
  sectionIdx: number,
  itemIdx: number,
  patch: Partial<InspectionItem>,
) => void;

/**
 * Update a section (title/items). Optional because not every screen/provider supports it.
 * BatteryGrid (+ Add Battery) and similar “dynamic grid” UIs need this.
 */
export type UpdateSectionFn = (
  sectionIdx: number,
  patch: Partial<Pick<InspectionSection, "title" | "items">>,
) => void;

export type InspectionFormContextValue = {
  updateItem: UpdateItemFn;

  /**
   * Optional. If your provider supplies this, grids can append rows/items
   * (ex: BatteryGrid "+ Add Battery", TireGrid "+ Add Axle", etc).
   */
  updateSection?: UpdateSectionFn;
};

// Export the context itself (no wrapper component!)
export const InspectionFormCtx = createContext<InspectionFormContextValue | null>(null);

export function useInspectionForm(): InspectionFormContextValue {
  const ctx = useContext(InspectionFormCtx);
  if (!ctx) {
    throw new Error("useInspectionForm must be used inside <InspectionFormCtx.Provider>");
  }
  return ctx;
}