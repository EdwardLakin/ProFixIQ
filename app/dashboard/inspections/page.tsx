"use client";

import { Suspense } from "react";
import InspectionMenuClient from "@/features/inspections/app/inspection/InspectionMenuClient";

export default function InspectionsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-white">Loading…</div>}>
      <InspectionMenuClient />
    </Suspense>
  );
}
