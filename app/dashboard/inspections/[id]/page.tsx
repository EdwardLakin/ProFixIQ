// app/dashboard/inspections/[id]/page.tsx
"use client";

import { Suspense } from "react";
import FeaturePage from "@inspections/app/inspection/[id]/page";

export const revalidate = 0;

export default function Page() {
  return (
    <Suspense fallback={<div className="text-sm text-neutral-400">Loading…</div>}>
      <FeaturePage />
    </Suspense>
  );
}