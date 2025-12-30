/// features/shared/components/ui/WhySection.tsx
"use client";

export default function WhySection() {
  const bullets = [
    "Keep fleets and retail customers on the road with consistent inspections, measurements, and pre-trips.",
    "Give techs a clear queue, corner grids, and voice tools that match how they actually work on the floor.",
    "Turn findings into clean quotes, approvals, and invoices without retyping the same job three times.",
    "Give fleet managers and owners a portal for status, history, and evidence — without extra admin work for advisors.",
  ];

  return (
    <div className="mx-auto max-w-5xl text-center text-white">
      <div
        className="text-xs font-semibold uppercase tracking-[0.22em]"
        style={{ color: "var(--pfq-copper)" }}
      >
        Why it works
      </div>

      <h2
        className="mt-2 text-3xl md:text-4xl text-white"
        style={{
          fontFamily: "var(--font-blackops)",
          textShadow: "0 0 28px rgba(193, 102, 59, 0.18)",
        }}
      >
        Built for heavy-duty &amp; fleet life
      </h2>

      <p className="mt-4 text-base leading-relaxed text-neutral-300 md:text-lg">
        ProFixIQ is designed around bays, buses, and trucks — not committee
        meetings. Less screen time, faster approvals, cleaner documentation
        for every unit that rolls through, whether it&apos;s one service truck
        or a national fleet.
      </p>

      <div className="mt-8 grid gap-4 text-left sm:grid-cols-2">
        {bullets.map((line) => (
          <div
            key={line}
            className="rounded-2xl border border-white/10 bg-black/35 p-4 backdrop-blur-xl"
          >
            <div className="flex items-start gap-3">
              <span
                className="mt-1 inline-flex h-5 w-5 items-center justify-center rounded-full border text-[11px]"
                style={{
                  borderColor: "rgba(255, 255, 255, 0.12)",
                  backgroundColor: "rgba(193, 102, 59, 0.18)",
                  color: "var(--pfq-copper)",
                }}
              >
                ✓
              </span>
              <span className="leading-relaxed text-neutral-200">{line}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}