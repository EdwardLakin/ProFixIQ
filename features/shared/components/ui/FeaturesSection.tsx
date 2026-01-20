"use client";

import FeatureCard from "@shared/components/ui/FeatureCard";

type FeaturesSectionProps = {
  showHeading?: boolean;
};

export default function FeaturesSection({ showHeading = false }: FeaturesSectionProps) {
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
            className="mt-2 text-3xl text-neutral-50 md:text-4xl"
            style={{ fontFamily: "var(--font-blackops)" }}
          >
            Everything included. One workflow.
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-neutral-300">
            Built for heavy-duty and fleet work first — but works great for automotive too.
            Less re-typing, faster approvals, and a clean evidence trail from inspection to invoice.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Onboarding + Intelligence */}
        <FeatureCard
          title="Seamless onboarding (Upload → Ready)"
          description="Drop in your exports once. ProFixIQ builds menus, templates, and a Shop Health Snapshot so you’re productive on day one."
          available
        />
        <FeatureCard
          title="Instant Shop Analysis (Demo)"
          description="AI summarizes top repairs, missed packages, comebacks, and fleet opportunities you can act on immediately."
          available
        />
        <FeatureCard
          title="This system gets smarter over time"
          description="Suggestions and automation improve as your shop runs inspections, quotes, and work orders. Less admin every week."
          available
        />

        {/* Inspections */}
        <FeatureCard
          title="HD Inspections & Corner Grids"
          description="Consistent tire, brake, and measurement grids across units. Photos, notes, and evidence stay attached."
          available
        />
        <FeatureCard
          title="Custom Inspection Builder"
          description="Build your own templates for trucks, trailers, buses, and automotive. Match how your shop actually inspects."
          available
        />
        <FeatureCard
          title="Voice-controlled inspections"
          description="Capture findings faster with voice and reduce typing. Keep techs working and limit screen time."
          available
        />

        {/* Work orders + automation */}
        <FeatureCard
          title="Work orders + quote automation"
          description="Turn inspection findings into clean lines and estimates without retyping the job multiple times."
          available
        />
        <FeatureCard
          title="Menu item creation"
          description="Build service menus and packages that match your shop’s real history and common repairs."
          available
        />
        <FeatureCard
          title="Quote & PO automation"
          description="Automate follow-ups, approvals, and purchasing workflows so parts and billing move without chasing."
          available
        />

        {/* Parts + communication */}
        <FeatureCard
          title="Parts system"
          description="Requests, receiving, allocations, and status visibility built into the workflow — not a separate tool."
          available
        />
        <FeatureCard
          title="Internal messaging"
          description="Keep techs, advisors, and parts on the same page with clean, in-context communication."
          available
        />
        <FeatureCard
          title="Role-based dashboards"
          description="Tech, advisor, parts, manager, owner — purpose-built views that reduce noise and speed decisions."
          available
        />

        {/* AI + portals + mobile */}
        <FeatureCard
          title="AI-assisted diagnosis & suggestions"
          description="Suggest next steps, common fixes, labor guidance, and inspection coverage tuned to your shop’s patterns."
          available
        />
        <FeatureCard
          title="Fleet portal"
          description="Approve work, view evidence, track status, and see history — without extra admin work for advisors."
          available
        />
        <FeatureCard
          title="Customer portal"
          description="Clean approvals, status, and documentation for non-fleet customers — the same evidence trail, simplified."
          available
        />
        <FeatureCard
          title="Mobile companion (Tech + Advisor)"
          description="Purpose-built mobile flow for bay work and quick approvals. Faster throughput, fewer interruptions."
          available
        />
        <FeatureCard
          title="AI assistant for admin tasks"
          description="Find work orders, chase approvals, answer questions, and surface what matters without digging through screens."
          available
        />
        <FeatureCard
          title="Internal agent for live requests"
          description="Submit feature requests and bug reports inside the app so fixes ship faster and stay organized."
          available
        />
      </div>
    </div>
  );
}