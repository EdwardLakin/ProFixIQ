"use client";

import { Suspense } from "react";
import FeaturePage from "@/features/work-orders/app/work-orders/create/page";

export default function Page() {
  return (
    <Suspense fallback={<div className="text-white">Loading…</div>}>
      <FeaturePage />
    </Suspense>
  );
}