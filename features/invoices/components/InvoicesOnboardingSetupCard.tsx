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

const STEP_KEY = "invoices" as const;

const COMPLETE_SUMMARY = {
  manualSetup: true,
  importedCount: 0,
  note: "Invoices reviewed.",
};

const SKIP_REASON = "Invoices skipped during onboarding.";

type Props = {
  guidedQuery: GuidedOnboardingQuery | null;
};

export function getInvoicesGuidedOnboardingQuery(params: URLSearchParams): GuidedOnboardingQuery | null {
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

export function InvoicesOnboardingSetupCard({ guidedQuery }: Props) {
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
        throw new Error(payload.error ?? "Unable to update the invoices onboarding step.");
      }
      router.push(query.returnTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update the invoices onboarding step.");
    } finally {
      setBusyAction(null);
    }
  }

  const disabled = busyAction !== null;

  return (
    <OnboardingHighlightFrame
      active
      highlightKey={query.highlight}
      title="Invoice setup/import"
      description="Guided onboarding brought you here because billing and invoices belong in the real invoice workflow."
    >
      <section className="rounded-2xl border border-[color:var(--desktop-border)] bg-[radial-gradient(circle_at_top_left,rgba(197,122,74,0.16),rgba(15,23,42,0.92)_38%,rgba(2,6,23,0.96))] p-4 shadow-[0_20px_70px_rgba(0,0,0,0.55)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-200/85">Guided onboarding · Invoices</div>
            <h2 className="mt-2 text-xl font-semibold text-white">Review historical invoice setup</h2>
            <div className="mt-3 space-y-2 text-sm text-neutral-300">
              <p>Invoice import will live here so historical billing records stay connected to your real invoice workflow.</p>
              <p>No invoice importer runs from this card yet. Mark this step reviewed when you are ready to continue, or skip it for now.</p>
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
              {busyAction === "complete" ? "Marking reviewed…" : "Mark invoices reviewed"}
            </button>
            <button
              type="button"
              onClick={() => void postStepAction("skip")}
              disabled={disabled}
              className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-white/[0.08] disabled:opacity-55"
            >
              {busyAction === "skip" ? "Skipping…" : "Skip invoices for now"}
            </button>
            <Link
              href={query.returnTo}
              className="rounded-xl border border-sky-500/30 bg-sky-950/25 px-4 py-2 text-center text-sm font-semibold text-sky-100 hover:bg-sky-900/30"
            >
              Back to Data Onboarding
            </Link>
          </div>
        </div>
      </section>
    </OnboardingHighlightFrame>
  );
}
