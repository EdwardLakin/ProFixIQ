"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { OnboardingHighlightFrame } from "@/features/onboarding-v2/components/OnboardingHighlightFrame";
import { GUIDED_ONBOARDING_SOURCE } from "@/features/onboarding-v2/guided/steps";
import {
  isSafeGuidedReturnTo,
  parseGuidedOnboardingQuery,
  type GuidedOnboardingQuery,
} from "@/features/onboarding-v2/guided/query";

const STEP_KEY = "service_history" as const;

const COMPLETE_SUMMARY = {
  manualSetup: true,
  importedCount: 0,
  note: "Service history reviewed.",
};

const SKIP_REASON = "Service history skipped during onboarding.";

type Props = {
  guidedQuery: GuidedOnboardingQuery | null;
};

export function getServiceHistoryGuidedOnboardingQuery(params: URLSearchParams): GuidedOnboardingQuery | null {
  const parsed = parseGuidedOnboardingQuery(params);
  if (parsed?.onboardingStep === STEP_KEY) return parsed;

  const onboardingSession = params.get("onboardingSession") ?? "";
  const onboardingStep = params.get("onboardingStep") ?? "";
  const highlight = params.get("highlight") ?? "";
  const returnTo = params.get("returnTo") ?? "";

  if (!onboardingSession) return null;
  if (onboardingStep !== STEP_KEY) return null;
  if (!highlight) return null;
  if (!isSafeGuidedReturnTo(returnTo)) return null;

  return {
    onboardingSession,
    onboardingStep: STEP_KEY,
    highlight,
    returnTo,
    source: GUIDED_ONBOARDING_SOURCE,
  };
}

export function ServiceHistoryOnboardingSetupCard({ guidedQuery }: Props) {
  const router = useRouter();
  const [busyAction, setBusyAction] = useState<"complete" | "skip" | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!guidedQuery) return null;

  const query = guidedQuery;

  async function postStepAction(action: "complete" | "skip") {
    setBusyAction(action);
    setError(null);

    try {
      const response = await fetch(
        `/api/onboarding-v2/guided/sessions/${encodeURIComponent(query.onboardingSession)}/steps/${STEP_KEY}/${action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            action === "complete"
              ? { summary: COMPLETE_SUMMARY }
              : { skippedReason: SKIP_REASON },
          ),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!response.ok || payload.ok === false) {
        throw new Error(payload.error ?? "Unable to update the service history onboarding step.");
      }
      router.push(query.returnTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update the service history onboarding step.");
    } finally {
      setBusyAction(null);
    }
  }

  const disabled = busyAction !== null;

  return (
    <OnboardingHighlightFrame
      active
      highlightKey={query.highlight}
      title="Service history setup/import"
      description="Guided onboarding brought you here because past repairs belong in the real work order history."
    >
      <section className="rounded-2xl border border-[color:var(--desktop-border)] bg-[var(--theme-gradient-panel)] p-4 shadow-[var(--theme-shadow-medium)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-200/85">Guided onboarding · Service history</div>
            <h2 className="mt-2 text-xl font-semibold text-[color:var(--theme-text-primary)]">Review historical service setup</h2>
            <div className="mt-3 space-y-2 text-sm text-[color:var(--theme-text-secondary)]">
              <p>Service history import will live here so past repairs stay tied to the real work order history.</p>
              <p>No service history importer runs from this card yet. Mark this step reviewed when you are ready to continue, or skip it for now.</p>
            </div>
            {error ? (
              <div className="mt-4 rounded-xl border border-red-500/25 bg-red-950/30 p-3 text-sm text-red-100">{error}</div>
            ) : null}
          </div>

          <div className="flex w-full flex-col gap-2 lg:w-auto lg:min-w-72">
            <button
              type="button"
              onClick={() => void postStepAction("complete")}
              disabled={disabled}
              className="rounded-xl border border-emerald-500/35 bg-emerald-950/25 px-4 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-900/30 disabled:opacity-55"
            >
              {busyAction === "complete" ? "Marking reviewed…" : "Mark reviewed"}
            </button>
            <button
              type="button"
              onClick={() => void postStepAction("skip")}
              disabled={disabled}
              className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-4 py-2 text-sm font-semibold text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-subtle)] disabled:opacity-55"
            >
              {busyAction === "skip" ? "Skipping…" : "Skip for now"}
            </button>
            <Link
              href={query.returnTo}
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
