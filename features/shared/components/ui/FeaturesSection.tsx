"use client";

import Section from "./Section";
import FeatureCard from "./FeatureCard";

const FEATURES = [
  {
    title: "AI-Powered Diagnostics",
    subtitle: "Instant fault predictions",
    content:
      "Narrow down likely causes before you touch a tool. Ask follow-ups to confirm symptoms and next steps.",
  },
  {
    title: "Inspections Your Way",
    subtitle: "Custom forms & checklists",
    content:
      "Photo capture, notes, voice input, tags—everything techs need to document and share clearly.",
  },
  {
    title: "Work Orders & Quotes",
    subtitle: "From complaint to PDF",
    content:
      "Estimate labor, parts, and taxes; assign jobs; generate shareable quotes and invoices in a click.",
  },
  {
    title: "Voice + Photos",
    subtitle: "Hands-free capture",
    content:
      "Add line items by voice, markup images, and keep evidence tidy for customers and insurance.",
  },
  {
    title: "Team & Roles",
    subtitle: "Built for shops",
    content:
      "Owner, Admin, Manager, Advisor, Parts, Tech. Give each role the tools (and permissions) they need.",
  },
  {
    title: "Priority Support",
    subtitle: "White-glove when you need it",
    content:
      "Pro+ adds priority help and optional extra seats as your shop grows.",
  },
];

export default function FeaturesSection() {
  return (
    <Section id="features" className="text-white">
      <h2 className="text-4xl font-blackops text-center mb-10 text-orange-400 drop-shadow">
        Powerful Features
      </h2>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <FeatureCard
            key={f.title}
            title={f.title}
            subtitle={f.subtitle}
            content={f.content}
          />
        ))}
      </div>

      <p className="text-center mt-8 text-gray-400">
        Have questions? Open the chatbot and ask anything about ProFixIQ.
      </p>
    </Section>
  );
}