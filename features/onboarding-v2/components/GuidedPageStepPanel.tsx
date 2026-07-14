"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import type { GuidedOnboardingStepKey } from "@/features/onboarding-v2/guided/types";
import {
  getGuidedStepPageInstructions,
  type GuidedPageContext,
} from "@/features/onboarding-v2/guided/pageContext";
import { usePersistentGuidedPageContext } from "@/features/onboarding-v2/guided/persistence";

type GuidedPanelAction = {
  label: string;
  description?: string;
  onClick: () => void;
};

type GuidedPageStepPanelProps = {
  context?: GuidedPageContext | null;
  className?: string;
  actions?: Partial<Record<GuidedOnboardingStepKey, GuidedPanelAction>>;
};

type FinishAction = "complete" | "skip";

const baseButtonClass =
  "rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition disabled:cursor-not-allowed disabled:opacity-60";

export default function GuidedPageStepPanel({ context: contextOverride, className = "", actions }: GuidedPageStepPanelProps) {
  const router = useRouter();
  const parsedContext = usePersistentGuidedPageContext();
  const context = contextOverride === undefined ? parsedContext : contextOverride;
  const [busyAction, setBusyAction] = useState<FinishAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!context) return null;

  const stepAction = actions?.[context.stepKey];
  const completeLabel = busyAction === "complete" ? "Marking complete…" : "Mark step complete";
  const skipLabel = busyAction === "skip" ? "Skipping…" : "Skip for now";

  async function finishStep(action: FinishAction) {
    if (!context) return;
    setBusyAction(action);
    setError(null);
    const response = await fetch(
      `/api/onboarding-v2/guided/sessions/${encodeURIComponent(context.sessionId)}/steps/${encodeURIComponent(context.stepKey)}/${action}`,
      { method: "POST" },
    );
    if (!response.ok) {
      setBusyAction(null);
      setError((await response.text()) || `Unable to ${action} this guided setup step.`);
      return;
    }
    router.push(context.returnTo);
  }

  return (
    <section
      aria-label={`Guided setup step: ${context.step.title}`}
      className={`rounded-3xl border border-[var(--accent-copper-soft)]/60 bg-[var(--theme-gradient-panel)] p-4 text-[color:var(--theme-text-primary)] shadow-[var(--theme-shadow-medium)] backdrop-blur-xl sm:p-5 ${className}`}
      data-guided-step={context.stepKey}
      data-guided-highlight={context.highlight ?? undefined}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl space-y-3">
          <div className="inline-flex rounded-full border border-[var(--accent-copper-soft)]/55 bg-[color:var(--theme-surface-inset)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--accent-copper,#C57A4A)]">
            Guided setup
          </div>
          <div>
            <h2 className="text-xl font-semibold text-[color:var(--theme-text-primary)] sm:text-2xl" style={{ fontFamily: "var(--font-blackops), system-ui" }}>
              {context.step.title}
            </h2>
            <p className="mt-1 text-sm text-[color:var(--theme-text-primary)]">{context.step.question}</p>
          </div>
          <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3 text-sm text-[color:var(--theme-text-primary)]">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">What to do here</div>
            {getGuidedStepPageInstructions(context.stepKey)}
          </div>
          {stepAction ? (
            <div className="rounded-2xl border border-sky-400/25 bg-sky-500/10 p-3 text-sm text-sky-100">
              <button
                type="button"
                onClick={stepAction.onClick}
                className={`${baseButtonClass} border border-sky-300/45 bg-sky-400/15 text-sky-50 hover:bg-sky-400/25`}
              >
                {stepAction.label}
              </button>
              {stepAction.description ? <p className="mt-2 text-xs text-sky-100/75">{stepAction.description}</p> : null}
            </div>
          ) : null}
          {error ? <p className="text-sm text-red-200">{error}</p> : null}
        </div>
        <div className="flex min-w-[220px] flex-col gap-2">
          <button
            type="button"
            onClick={() => void finishStep("complete")}
            disabled={busyAction !== null}
            className={`${baseButtonClass} border border-emerald-300/45 bg-emerald-500/15 text-emerald-50 hover:bg-emerald-500/25`}
          >
            {completeLabel}
          </button>
          <button
            type="button"
            onClick={() => void finishStep("skip")}
            disabled={busyAction !== null}
            className={`${baseButtonClass} border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-subtle)]`}
          >
            {skipLabel}
          </button>
          <button
            type="button"
            onClick={() => router.push(context.returnTo)}
            className={`${baseButtonClass} border border-[var(--accent-copper-soft)]/45 bg-[color:var(--theme-surface-inset)] text-[var(--accent-copper,#C57A4A)] hover:bg-[color:var(--theme-surface-inset)]`}
          >
            Back to guided setup
          </button>
        </div>
      </div>
    </section>
  );
}
