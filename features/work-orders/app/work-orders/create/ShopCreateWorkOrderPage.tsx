"use client";

import { useState } from "react";

import CreateWorkOrderPage from "./page";

const LEGACY_QUICK_INTAKE_DISMISS_KEY = "pfq.create.intake.dismiss.v1";

/**
 * Shop work-order creation intentionally skips the legacy post-save intake modal.
 * Portal appointment intake remains available through its dedicated portal route.
 */
export default function ShopCreateWorkOrderPage() {
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

  return <CreateWorkOrderPage />;
}
