"use client";


export const dynamic = "force-dynamic";
export const revalidate = 0;
import { Suspense } from "react";
// re-use the client component that lives under features/
import InspectionMenuClient from "@/features/inspections/app/inspection/InspectionMenuClient";

export default function InspectionsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-white">Loading…</div>}>
      <InspectionMenuClient />
    </Suspense>
  );
}

// If Vercel still tries to fully prerender this page, you can also
// un-comment the following line to force dynamic rendering:
// export const dynamic = "force-dynamic";
