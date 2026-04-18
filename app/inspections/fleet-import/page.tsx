"use client";

import FleetFormImportCard from "@/features/inspections/components/FleetFormImportCard";

export default function FleetFormImportPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-6 text-white">
      {/* metallic / copper wash */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            "var(--app-shell-bg, radial-gradient(circle at top, rgba(59,130,246,0.12), transparent 55%), radial-gradient(circle at bottom, rgba(15,23,42,0.96), #020617 78%))",
        }}
      />

      <div className="mb-4">
        <div className="text-[11px] font-blackops uppercase tracking-[0.22em] text-neutral-400">
          Fleet Inspections
        </div>
        <h1 className="mt-1 text-xl font-blackops text-neutral-50 md:text-2xl">
          Import a fleet inspection form
        </h1>
        <p className="mt-1 text-xs text-neutral-400">
          Upload a customer&apos;s existing paper/PDF inspection sheet and turn it
          into a reusable ProFixIQ template.
        </p>
      </div>

      <FleetFormImportCard />
    </main>
  );
}
