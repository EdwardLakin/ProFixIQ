"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { OnboardingHighlightFrame } from "@/features/onboarding-v2/components/OnboardingHighlightFrame";
import type { GuidedOnboardingQuery } from "@/features/onboarding-v2/guided/query";

type Props = {
  guidedQuery: GuidedOnboardingQuery;
  onOpenVehicleWorkflow: () => void;
  workflowCtaLabel?: string;
};

const COMPLETE_SUMMARY = {
  manualSetup: true,
  importedCount: 0,
  note: "Vehicle setup step completed manually.",
};

export function VehicleOnboardingSetupCard({
  guidedQuery,
  onOpenVehicleWorkflow,
  workflowCtaLabel = "Create/select a customer",
}: Props) {
  const router = useRouter();
  const [busyAction, setBusyAction] = useState<"complete" | "skip" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function postStepAction(action: "complete" | "skip") {
    setBusyAction(action);
    setError(null);

    try {
      const response = await fetch(
        `/api/onboarding-v2/guided/sessions/${encodeURIComponent(guidedQuery.onboardingSession)}/steps/vehicles/${action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            action === "complete"
              ? { summary: COMPLETE_SUMMARY }
              : { skippedReason: "No vehicle import during onboarding." },
          ),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!response.ok || payload.ok === false) {
        throw new Error(payload.error ?? "Unable to update the vehicles onboarding step.");
      }
      router.push(guidedQuery.returnTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update the vehicles onboarding step.");
    } finally {
      setBusyAction(null);
    }
  }

  const disabled = busyAction !== null;

  return (
    <OnboardingHighlightFrame
      active
      highlightKey={guidedQuery.highlight}
      title="Vehicle setup/import"
      description="Guided onboarding brought you here because vehicle setup belongs in the customer file workflow."
    >
      <section className="rounded-2xl border border-[color:var(--desktop-border)] bg-[radial-gradient(circle_at_top_left,rgba(197,122,74,0.16),rgba(15,23,42,0.92)_38%,rgba(2,6,23,0.96))] p-4 shadow-[0_20px_70px_rgba(0,0,0,0.55)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-200/85">Guided onboarding · Vehicles</div>
            <h2 className="mt-2 text-xl font-semibold text-white">Do you want to bring in your vehicle list now?</h2>
            <div className="mt-3 space-y-2 text-sm text-neutral-300">
              <p>This is where vehicle setup/import will live.</p>
              <p>Vehicles are tied to customer files, so this step helps you prepare vehicle records in the real workflow.</p>
              <p>For now, you can create vehicles manually from customer files.</p>
              <p>CSV import will be added here next.</p>
            </div>
            {error ? (
              <div className="mt-4 rounded-xl border border-red-500/25 bg-red-950/30 p-3 text-sm text-red-100">{error}</div>
            ) : null}
          </div>

          <div className="flex w-full flex-col gap-2 lg:w-auto lg:min-w-72">
            <button
              type="button"
              onClick={onOpenVehicleWorkflow}
              className="rounded-xl border border-[var(--accent-copper-soft)]/60 bg-[linear-gradient(135deg,rgba(197,122,74,0.26),rgba(197,122,74,0.14))] px-4 py-2 text-sm font-semibold text-orange-50 hover:border-[var(--accent-copper)] hover:bg-orange-400/15"
            >
              {workflowCtaLabel}
            </button>
            <button
              type="button"
              onClick={() => void postStepAction("skip")}
              disabled={disabled}
              className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-white/[0.08] disabled:opacity-55"
            >
              {busyAction === "skip" ? "Skipping…" : "Skip for now"}
            </button>
            <Link
              href={guidedQuery.returnTo}
              className="rounded-xl border border-sky-500/30 bg-sky-950/25 px-4 py-2 text-center text-sm font-semibold text-sky-100 hover:bg-sky-900/30"
            >
              Return to Data Onboarding
            </Link>
          </div>
        </div>
      </section>
    </OnboardingHighlightFrame>
  );
}
