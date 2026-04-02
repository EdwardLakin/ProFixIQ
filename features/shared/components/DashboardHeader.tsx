"use client";

import OpsNotificationsBell from "./OpsNotificationsBell";

export default function DashboardHeader() {
  return (
    <header className="mb-6 w-full rounded-2xl border border-white/10 bg-black/30 p-6 text-white shadow-card backdrop-blur-xl">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex flex-col items-start">
          <h1 className="text-3xl font-blackops tracking-[0.08em] text-[var(--accent-copper-light)]">
            ProFixIQ
          </h1>
          <p className="mt-1 text-sm text-neutral-400">
            AI-powered repair assistant built for mechanics
          </p>
        </div>

        <OpsNotificationsBell />
      </div>
    </header>
  );
}
