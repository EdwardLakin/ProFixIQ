"use client";

import { Suspense } from "react";
// Reuse your feature implementation (kept in /features)
import FeaturePage from "@/features/work-orders/app/work-orders/page";

export default function Page() {
  return (
    <Suspense fallback={<div className="text-white">Loading…</div>}>
      <FeaturePage />
    </Suspense>
  );
}