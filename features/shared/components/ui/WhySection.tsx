"use client";

import Section from "./Section";

export default function WhySection() {
  return (
    <Section id="why" className="bg-neutral-950 text-white">
      <div className="max-w-5xl mx-auto text-center">
        <h2 className="text-3xl font-blackops text-orange-400 mb-6 drop-shadow">
          Why ProFixIQ?
        </h2>

        <p className="text-lg text-gray-300 leading-relaxed mb-8">
          ProFixIQ was built by a technician who lived shop life — not by a
          committee. The goal is simple: <em>less screen time, faster answers,
          cleaner documentation</em>. From AI-assisted diagnostics to shareable
          quotes and role-based work management, ProFixIQ removes the friction
          that slows techs and advisors down.
        </p>

        <div className="grid gap-4 sm:grid-cols-2 text-left">
          {[
            "Cut diagnostic guesswork with AI suggestions and symptom guides.",
            "Speed up inspections with reusable templates, photos, and voice notes.",
            "Turn findings into quotes and work orders with accurate labor estimates.",
            "Keep everyone on the same page with roles, permissions, and status.",
          ].map((line, i) => (
            <div
              key={i}
              className="rounded border border-neutral-800 bg-black/40 p-4"
            >
              <span className="text-orange-400 mr-2">✓</span>
              <span className="text-gray-200">{line}</span>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}