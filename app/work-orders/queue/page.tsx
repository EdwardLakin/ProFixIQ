"use client"

import { Suspense } from "react";
import FeaturePage from "@/features/work-orders/app/work-orders/queue/page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-white">Loading…</div>}>
      <FeaturePage />
    </Suspense>
  );
}
