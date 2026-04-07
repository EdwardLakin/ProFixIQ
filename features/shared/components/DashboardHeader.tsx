"use client";

import OpsNotificationsBell from "./OpsNotificationsBell";

export default function DashboardHeader() {
  return (
    <header
      className="mb-6 w-full border p-6 backdrop-blur-xl"
      style={{
        borderColor: "var(--theme-card-border,#334155)",
        background: "var(--theme-card-bg,#111827)",
        color: "var(--theme-text-primary,#FFFFFF)",
        borderRadius: "var(--theme-radius-xl,1rem)",
        boxShadow: "var(--theme-shadow-medium,0_18px_45px_rgba(0,0,0,0.45))",
      }}
    >
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex flex-col items-start">
          <h1
            className="text-3xl tracking-[0.08em]"
            style={{
              fontFamily: "var(--font-blackops), system-ui, sans-serif",
              color: "var(--brand-accent,#E2A164)",
            }}
          >
            ProFixIQ
          </h1>
          <p
            className="mt-1 text-sm"
            style={{ color: "var(--theme-text-secondary,#94A3B8)" }}
          >
            AI-powered repair assistant built for mechanics
          </p>
        </div>

        <OpsNotificationsBell />
      </div>
    </header>
  );
}
