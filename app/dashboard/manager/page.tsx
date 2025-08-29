// app/dashboard/manager/page.tsx (wrapper stays as-is)
"use client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

import { Suspense } from "react";
import FeaturePage from "@/features/dashboard/app/dashboard/manager/page";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-4 text-white">Loading…</div>}>
      <FeaturePage />
    </Suspense>
  );
}
