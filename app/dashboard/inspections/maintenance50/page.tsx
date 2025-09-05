// app/dashboard/inspections/maintenance50/page.tsx
"use client";

import { Suspense } from "react";
import FeaturePage from "@inspections/app/inspection/maintenance50/page";

export const revalidate = 0;

export default function Page() {
  return (
    <Suspense fallback={<div className="text-sm text-neutral-400">Loading…</div>}>
      <FeaturePage />
    </Suspense>
  );
}