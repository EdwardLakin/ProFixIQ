"use client";

import { useState } from "react";

import CreateWorkOrderPage, { type EquipmentCreationContext } from "./page";
import PreviousDeferredWorkPanel from "./PreviousDeferredWorkPanel";

const LEGACY_QUICK_INTAKE_DISMISS_KEY = "pfq.create.intake.dismiss.v1";

/**
 * Shop work-order creation intentionally skips the legacy post-save intake modal.
 * Portal appointment intake remains available through its dedicated portal route.
 */
export default function ShopCreateWorkOrderPage({ equipmentContext }: { equipmentContext?: EquipmentCreationContext } = {}) {
  useState(() => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(LEGACY_QUICK_INTAKE_DISMISS_KEY, "1");
      } catch {
        // Storage can be unavailable in private/restricted browser contexts.
      }
    }
    return true;
  });

  return (
    <>
      <PreviousDeferredWorkPanel vehicleId={equipmentContext?.assetId} />
      {equipmentContext ? <CreateWorkOrderPage equipmentContext={equipmentContext} /> : <CreateWorkOrderPage />}
    </>
  );
}
