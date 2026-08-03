"use client";

import FleetFormImportCard from "@/features/inspections/components/FleetFormImportCard";

export default function FleetFormImportPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-6 text-[color:var(--theme-text-primary)]">
      {/* metallic / copper wash */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            "var(--theme-gradient-panel)",
        }}
      />

      <div className="mb-4">
        <div className="text-[11px] font-blackops uppercase tracking-[0.22em] text-[color:var(--theme-text-secondary)]">
          Fleet Inspections
        </div>
        <h1 className="mt-1 text-xl font-blackops text-[color:var(--theme-text-primary)] md:text-2xl">
          Import a fleet inspection form
        </h1>
        <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
          Upload or photograph a customer&apos;s existing inspection sheet and turn
          it into a reusable ProFixIQ template. Processing continues in the background.
        </p>
      </div>

      <FleetFormImportCard />
    </main>
  );
}
