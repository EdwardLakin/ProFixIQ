"use client";

import Section from "./Section";

export default function WhySection() {
  const bullets = [
    "Cut diagnostic guesswork with AI suggestions and symptom guides.",
    "Speed up inspections with reusable templates, photos, and voice notes.",
    "Turn findings into quotes and work orders with consistent labor structure.",
    "Keep everyone aligned with roles, permissions, and status clarity.",
  ];

  return (
    <Section id="why" className="bg-transparent text-white">
      <div className="max-w-5xl mx-auto text-center">
        <div
          className="text-xs font-semibold uppercase tracking-[0.22em]"
          style={{ color: "var(--accent-copper)" }}
        >
          Why it works
        </div>

        <h2
          className="mt-2 text-3xl md:text-4xl font-blackops text-white"
          style={{
            textShadow: "0 0 28px rgba(193, 102, 59, 0.18)",
          }}
        >
          Built for technicians — not committees
        </h2>

        <p className="mt-4 text-base md:text-lg text-neutral-300 leading-relaxed">
          ProFixIQ was built by a technician who lived shop life. The goal is
          simple:{" "}
          <em>
            less screen time, faster answers, cleaner documentation.
          </em>{" "}
          From AI-assisted diagnostics to customer-ready approvals, ProFixIQ
          removes friction for techs and advisors.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 text-left">
          {bullets.map((line) => (
            <div
              key={line}
              className="rounded-2xl border border-white/10 bg-black/30 p-4 backdrop-blur-xl"
            >
              <div className="flex items-start gap-3">
                <span
                  className="mt-1 inline-flex h-5 w-5 items-center justify-center rounded-full border"
                  style={{
                    borderColor: "rgba(255,255,255,0.12)",
                    backgroundColor: "rgba(193,102,59,0.18)",
                    color: "var(--accent-copper-light)",
                  }}
                >
                  ✓
                </span>
                <span className="text-neutral-200 leading-relaxed">{line}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}