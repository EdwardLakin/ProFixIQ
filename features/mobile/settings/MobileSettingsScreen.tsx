// features/mobile/settings/MobileSettingsScreen.tsx
"use client";

import React from "react";
import type { JobLine } from "@/features/shared/components/PunchInOutButton";

type Props = {
  techName: string;
  activeJob: JobLine | null;
  onPunchIn: () => void;  // kept for compatibility; unused for now
  onPunchOut: () => void; // kept for compatibility; unused for now
};

export function MobileSettingsScreen({
  techName,
  activeJob,
}: Props) {
  const firstName = techName?.split(" ")[0] ?? techName ?? "Tech";

  return (
    <div className="px-4 py-4 space-y-4">
      <section className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 shadow-card">
        <h1 className="text-lg font-semibold text-white">
          {firstName}&apos;s Settings
        </h1>
        <p className="mt-1 text-xs text-neutral-400">
          Personal options for the companion app.
        </p>
      </section>

      <section className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 shadow-card space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
          Time tracking
        </h2>
        <p className="text-[0.75rem] text-neutral-300">
          {activeJob
            ? `You are currently punched in on ${activeJob.vehicle}.`
            : "You are currently punched out."}
        </p>

        <p className="text-[0.7rem] text-neutral-500">
          Punch in/out is now available from the bottom bar so you can toggle
          from anywhere in the mobile companion.
        </p>
      </section>

      {/* space for more mobile-only settings later */}
    </div>
  );
}