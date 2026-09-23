"use client";

import { useState } from "react";
import { ClipboardCheck, ShieldCheck } from "lucide-react";

import FleetMaintenanceInspectionBuilder from "@/features/fleet/components/FleetMaintenanceInspectionBuilder";
import FleetPretripTemplateBuilder from "@/features/fleet/components/FleetPretripTemplateBuilder";

type Purpose = "pretrip" | "maintenance";

export default function FleetInspectionTemplateBuilder({
  fleetId,
}: {
  fleetId: string;
}) {
  const [purpose, setPurpose] = useState<Purpose>("pretrip");

  return (
    <main className="space-y-6">
      <header className="rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-5 shadow-[var(--theme-shadow-medium)]">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-500 dark:text-sky-300">
          Fleet configuration
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Fleet Inspection Builder
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-[color:var(--theme-text-secondary)]">
          Build Fleet-owned inspection forms from the same master inspection
          list used by ProFixIQ Shop. Driver pre-trips stay in the Driver
          Pre-trip workflow. Maintenance and PM inspections are compatible with
          the Shop inspection engine but do not give Fleet users Shop or
          work-order capabilities.
        </p>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <button
            type="button"
            onClick={() => setPurpose("pretrip")}
            className={[
              "rounded-2xl border p-4 text-left transition",
              purpose === "pretrip"
                ? "border-sky-400/50 bg-sky-400/10 ring-2 ring-sky-400/20"
                : "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)]",
            ].join(" ")}
          >
            <div className="flex items-center gap-2 font-semibold">
              <ShieldCheck className="h-4 w-4 text-sky-500" />
              Driver pre-trip
            </div>
            <p className="mt-2 text-xs text-[color:var(--theme-text-secondary)]">
              Runs in the Fleet Driver pre-trip form and feeds dispatcher
              defect/compliance review.
            </p>
          </button>

          <button
            type="button"
            onClick={() => setPurpose("maintenance")}
            className={[
              "rounded-2xl border p-4 text-left transition",
              purpose === "maintenance"
                ? "border-sky-400/50 bg-sky-400/10 ring-2 ring-sky-400/20"
                : "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)]",
            ].join(" ")}
          >
            <div className="flex items-center gap-2 font-semibold">
              <ClipboardCheck className="h-4 w-4 text-sky-500" />
              Maintenance / PM inspection
            </div>
            <p className="mt-2 text-xs text-[color:var(--theme-text-secondary)]">
              Fleet defines and requests it. A subscribed Shop accepts the
              request before technicians run it in the existing Shop inspection
              engine.
            </p>
          </button>
        </div>
      </header>

      {purpose === "pretrip" ? (
        <FleetPretripTemplateBuilder fleetId={fleetId} showPageHeader={false} />
      ) : (
        <FleetMaintenanceInspectionBuilder fleetId={fleetId} />
      )}
    </main>
  );
}
