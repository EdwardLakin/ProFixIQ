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
            Built for real shop flow
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-neutral-400">
            Everything you need to run the floor — plus automation that removes
            the drag.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <FeatureCard
          title="AI-Powered Diagnostics"
          description="Narrow down likely causes before you touch a tool. Ask follow-ups to confirm symptoms and next steps."
          available
        />
        <FeatureCard
          title="Inspections Your Way"
          description="Photo capture, notes, voice input, tags—everything techs need to document and share clearly."
          available
        />
        <FeatureCard
          title="Work Orders & Quotes"
          description="Estimate labor, parts, and taxes; assign jobs; generate shareable quotes and invoices in a click."
          available
        />
        <FeatureCard
          title="Voice + Photos"
          description="Add line items by voice, markup images, and keep evidence tidy for customers and insurance."
          available
        />
        <FeatureCard
          title="Team & Roles"
          description="Owner, Admin, Manager, Advisor, Parts, Tech. Give each role the tools (and permissions) they need."
          available
        />
        <FeatureCard
          title="Agent Requests + Live Updates"
          description="Submit QA/feature requests with context + screenshots. Track what’s happening while the agent runs."
          available
        />
      </div>
    </div>
  );
}