"use client";

import { Suspense } from "react";
import FeaturePage from "@inspections/app/inspection/customer-vehicle/page"; // ← your existing page

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-white">Loading…</div>}>
      <FeaturePage />
    </Suspense>
  );
}
