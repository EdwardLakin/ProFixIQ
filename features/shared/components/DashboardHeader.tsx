"use client";

import OpsNotificationsBell from "./OpsNotificationsBell";

export default function DashboardHeader() {
  return (
    <header className="mb-6 w-full rounded-md bg-surface p-6 text-accent shadow-card">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex flex-col items-start">
          <h1 className="text-3xl font-bold tracking-tight">ProFixIQ</h1>
          <p className="mt-1 text-sm text-muted">
            AI-powered repair assistant built for mechanics
          </p>
        </div>

        <OpsNotificationsBell />
      </div>
    </header>
  );
}
