"use client";

import FeatureCard from "@shared/components/ui/FeatureCard";

type FeaturesSectionProps = {
  showHeading?: boolean;
};

export default function FeaturesSection({ showHeading = false }: FeaturesSectionProps) {
  return (
    <div>
      {showHeading && (
        <h2
          className="text-center text-4xl md:text-5xl text-orange-400 mb-10"
          style={{ fontFamily: "var(--font-blackops)" }}
        >
          Powerful Features
        </h2>
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
          title="Priority Support"
          description="Pro+ adds priority help and optional extra seats as your shop grows."
          available
        />
      </div>
    </div>
  );
}