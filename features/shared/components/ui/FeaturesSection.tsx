// features/shared/components/ui/FeaturesSection.tsx
"use client";

import FeatureCard from "@shared/components/ui/FeatureCard";

type FeaturesSectionProps = {
  showHeading?: boolean;
};

export default function FeaturesSection({
  showHeading = false,
}: FeaturesSectionProps) {
  return (
    <div>
      {showHeading && (
        <div className="mb-10 text-center">
          <div
            className="text-xs font-semibold uppercase tracking-[0.22em]"
            style={{ color: "var(--accent-copper)" }}
          >
            Feature set
          </div>
          <h2
            className="mt-2 text-4xl md:text-5xl text-white"
            style={{ fontFamily: "var(--font-blackops)" }}
          >
            Built for shop & fleet work
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-neutral-400">
            Heavy-duty inspections, fleet programs, dispatch, and AI — all in
            one workflow instead of five disconnected tools. Works for single
            bays, busy HD shops, and full fleet operations.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <FeatureCard
          title="HD Inspections & Corner Grids"
          description="Run consistent tire, brake, and measurement grids across every unit. Photos, notes, and voice stay attached."
          available
        />
        <FeatureCard
          title="Fleet Programs & PM Packs"
          description="Build programs by fleet, unit, or class. Track due inspections, recurring work, and compliance history in one place."
          available
        />
        <FeatureCard
          title="Portal + Fleet Dispatch"
          description="Let fleets submit units, approve work, and see status. Keep advisors and dispatchers working from one shared board."
          available
        />
        <FeatureCard
          title="AI Planner for Any Job"
          description="Describe the concern once. The AI suggests inspections, lines, and estimates for cars, trucks, buses, and trailers."
          available
        />
        <FeatureCard
          title="Technician Queue & Chat"
          description="Give techs a clear queue, chat, and media all tied to jobs so they stay under the hoist, not in the office."
          available
        />
        <FeatureCard
          title="Evidence, Approvals & Invoices"
          description="Photos, videos, and measurements roll into approvals and invoices — keeping a defensible trail for customers and fleets."
          available
        />
      </div>
    </div>
  );
}