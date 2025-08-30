// app/dashboard/manager/page.tsx (wrapper stays as-is)
"use client";

import { Suspense } from "react";
import FeaturePage from "@/features/dashboard/app/dashboard/manager/page";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-4 text-white">Loading…</div>}>
      <FeaturePage />
    </Suspense>
  );
}
