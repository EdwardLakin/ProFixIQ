"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import FleetFormImportCard from "@/features/inspections/components/FleetFormImportCard";

export default function MobileInspectionFormImportPage() {
  const router = useRouter();
  const jobId = useSearchParams().get("jobId");
  useEffect(() => {
    if (jobId) router.replace(`/mobile/inspections/import/${jobId}`);
  }, [jobId, router]);

  return (
    <div className="min-h-screen space-y-4 bg-[color:var(--theme-surface-page)] px-4 py-4 text-[color:var(--theme-text-primary)]">
      <header>
        <div className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[var(--accent-copper)]">
          Inspection templates
        </div>
        <h1 className="mt-2 font-blackops text-lg uppercase tracking-[0.16em]">
          Import customer form
        </h1>
        <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
          Use the camera at the counter or vehicle. Processing continues if you
          leave this screen.
        </p>
      </header>
      <FleetFormImportCard mobile />
    </div>
  );
}
