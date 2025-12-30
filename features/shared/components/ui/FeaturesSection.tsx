"use client";

import FeatureCard from "@shared/components/ui/FeatureCard";

type FeaturesSectionProps = {
  showHeading?: boolean;
};

export default function FeaturesSection({
  showHeading = false,
}: FeaturesSectionProps) {
  return (
    <div className="space-y-8">
      {showHeading && (
        <div className="mb-4 text-center">
          <div
            className="text-xs font-semibold uppercase tracking-[0.22em]"
            style={{ color: "var(--pfq-copper)" }}
          >
            Feature set
          </div>
          <h2
            className="mt-2 text-3xl md:text-4xl text-neutral-50"
            style={{ fontFamily: "var(--font-blackops)" }}
          >
            Built for shop &amp; fleet work
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-neutral-300">
            Heavy-duty inspections, fleet programs, dispatch, and AI — all in a
            single workflow instead of five disconnected tools. Start with an
            Instant Shop Analysis demo, then turn those insights into live work
            orders and programs.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <FeatureCard
          title="Instant Shop Analysis (Demo)"
          description="Upload history once and let AI build a Shop Health Snapshot: top repairs, missed menus, and fleet opportunities you can act on today."
          available
        />
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
          title="AI Planner & Suggestions"
          description="Describe the concern once. AI suggests inspections, lines, and estimates — tuned by your Shop Health data and history."
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