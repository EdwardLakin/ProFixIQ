"use client";

import OpsNotificationsBell from "./OpsNotificationsBell";

export default function DashboardHeader() {
  return (
    <header
      className="mb-6 w-full rounded-2xl border p-6 backdrop-blur-xl"
      style={{
        borderColor:
          "color-mix(in srgb, var(--brand-primary, #C1663B) 26%, var(--metal-border-soft, rgba(148,163,184,0.3)))",
        background:
          "linear-gradient(135deg, color-mix(in srgb, var(--brand-secondary, #0F172A) 84%, black), rgba(0,0,0,0.78))",
        boxShadow:
          "0 20px 50px rgba(0,0,0,0.5), 0 0 24px color-mix(in srgb, var(--brand-primary, #C1663B) 14%, transparent)",
      }}
    >
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex flex-col items-start">
          <h1
            className="text-3xl tracking-[0.08em]"
            style={{
              fontFamily: "var(--font-blackops), system-ui, sans-serif",
              color: "var(--brand-accent, #E39A6E)",
            }}
          >
            ProFixIQ
          </h1>
          <p
            className="mt-1 text-sm"
            style={{
              color:
                "color-mix(in srgb, var(--brand-primary, #C1663B) 20%, #cbd5e1)",
            }}
          >
            AI-powered repair assistant built for mechanics
          </p>
        </div>

        <OpsNotificationsBell />
      </div>
    </header>
  );
}
