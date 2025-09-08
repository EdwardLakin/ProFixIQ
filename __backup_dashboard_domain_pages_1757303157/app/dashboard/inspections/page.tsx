// app/dashboard/inspections/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { Suspense } from "react";
import InspectionMenuClient from "@inspections/app/inspection/InspectionMenuClient";

export default function DashboardInspectionsPage() {
  return (
    <div className="px-4 py-6 text-white">
      <Suspense fallback={<div className="text-sm text-neutral-400">Loading…</div>}>
        <InspectionMenuClient />
      </Suspense>
    </div>
  );
}