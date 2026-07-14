"use client";

import OpsNotificationsBell from "./OpsNotificationsBell";

export default function DashboardHeader() {
  return (
    <header
      className="mb-6 w-full border p-6 backdrop-blur-xl"
      style={{
        borderColor: "var(--theme-card-border,var(--theme-border-soft))",
        background: "var(--theme-card-bg,var(--theme-surface-page))",
        color: "var(--theme-text-primary,var(--theme-text-inverse))",
        borderRadius: "var(--theme-radius-xl,1rem)",
        boxShadow: "var(--theme-shadow-medium)",
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
            style={{ color: "var(--theme-text-secondary,var(--theme-text-muted))" }}
          >
            AI-powered repair assistant built for mechanics
          </p>
        </div>

        <OpsNotificationsBell />
      </div>
    </header>
  );
}
