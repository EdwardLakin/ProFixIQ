"use client";

import FleetFormImportCard from "@/features/inspections/components/FleetFormImportCard";

export default function FleetFormImportPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-6 text-white">
      {/* metallic / copper wash */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.18),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.96),#020617_78%)]"
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