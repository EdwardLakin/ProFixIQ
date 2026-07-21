"use client";

import { useSearchParams } from "next/navigation";

import InspectionFormImportReview from "@/features/inspections/components/InspectionFormImportReview";

export default function FleetFormReviewPage() {
  const jobId = useSearchParams().get("jobId");
  return (
    <main className="mx-auto max-w-5xl px-4 py-6 text-[color:var(--theme-text-primary)]">
      {jobId ? (
        <InspectionFormImportReview jobId={jobId} />
      ) : (
        <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-6 text-sm text-[color:var(--theme-text-secondary)]">
          This older import link has no persistent job record. Start a new import so it can be resumed on any device.
        </div>
      )}
    </main>
  );
}
