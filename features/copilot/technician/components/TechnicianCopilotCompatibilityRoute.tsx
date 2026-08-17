"use client";

import Link from "next/link";

import { useTechnicianCopilotAvailabilityState } from "@/features/copilot/technician/client/useTechnicianCopilotAvailability";

export function TechnicianCopilotCompatibilityRoute({
  returnHref,
}: {
  returnHref: string;
}) {
  const availability = useTechnicianCopilotAvailabilityState(true);

  if (
    availability.status === "idle" ||
    availability.status === "checking" ||
    availability.status === "available"
  ) {
    return (
      <div className="p-6 text-sm text-muted-foreground" aria-live="polite">
        Opening your persistent Technician CoPilot…
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-xl p-6">
      <div className="rounded-2xl border bg-card p-5 shadow-sm" role="alert">
        <h1 className="text-lg font-semibold">Technician CoPilot unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {availability.message}
        </p>
        <Link
          href={returnHref}
          className="mt-4 inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Return to my jobs
        </Link>
      </div>
    </main>
  );
}
