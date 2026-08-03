"use client";

import { useParams } from "next/navigation";

import InspectionFormImportReview from "@/features/inspections/components/InspectionFormImportReview";

export default function MobileInspectionFormImportReviewPage() {
  const params = useParams<{ jobId: string }>();
  return (
    <main className="min-h-screen bg-[color:var(--theme-surface-page)] px-4 py-4 text-[color:var(--theme-text-primary)]">
      <InspectionFormImportReview jobId={params.jobId} mobile />
    </main>
  );
}
