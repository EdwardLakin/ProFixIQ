"use client";

import { useState } from "react";
import type { OnboardingAgentPlan } from "@/features/onboarding-agent/lib/agentPlanTypes";

function num(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function activationPreviewCopy(activationStarted: boolean): { title: string; description: string } {
  return activationStarted
    ? {
      title: "Activation readiness snapshot",
      description: "This snapshot is based on staged rows and review items. Some live records may already be created or matched.",
    }
    : {
      title: "Dry-run activation preview",
      description: "No live records have been created yet. These are activation candidates from persisted staged entities only.",
    };
}

export function OnboardingActivationPlanPanel({ latestPlan, fallbackSummary, agentPlan, activationStarted = false }: { latestPlan?: Record<string, unknown> | null; fallbackSummary?: Record<string, unknown> | null; agentPlan?: OnboardingAgentPlan | null; activationStarted?: boolean }) {
  const [showDevDetails, setShowDevDetails] = useState(false);
  const summary = (fallbackSummary ?? latestPlan?.summary ?? latestPlan ?? {}) as Record<string, any>;
  const preview = agentPlan?.activationPreview;
  const copy = activationPreviewCopy(activationStarted);
  const readyTotal = num(summary.customersReady) + num(summary.vehiclesReady) + num(summary.historicalWorkOrdersReady) + num(summary.historicalInvoicesReady) + num(summary.partsReady) + num(summary.vendorsReady) + num(summary.staffCandidatesReady) + num(summary.menuSuggestionsReady) + num(summary.inspectionSuggestionsReady);
  const reviewTotal = num(summary.reviewNeeded);

  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-4">
      <h3 className="text-sm font-semibold text-amber-100">{copy.title}</h3>
      <p className="mt-2 text-xs text-amber-200/80">{copy.description}</p>
      <p className="mt-1 text-xs text-amber-100/90">{readyTotal.toLocaleString()} ready, {reviewTotal.toLocaleString()} require review.</p>

      <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <div>Customers: <span className="font-semibold text-white">{num(summary.customersReady)}</span></div>
        <div>Vehicles: <span className="font-semibold text-white">{num(summary.vehiclesReady)}</span></div>
        <div>Historical work orders: <span className="font-semibold text-white">{num(summary.historicalWorkOrdersReady)}</span></div>
        <div>Historical invoices: <span className="font-semibold text-white">{num(summary.historicalInvoicesReady)}</span></div>
        <div>Parts: <span className="font-semibold text-white">{num(summary.partsReady)}</span></div>
        <div>Vendors: <span className="font-semibold text-white">{num(summary.vendorsReady)}</span></div>
        <div>Staff candidates: <span className="font-semibold text-white">{num(summary.staffCandidatesReady)}</span></div>
        <div>Menu suggestions: <span className="font-semibold text-white">{num(summary.menuSuggestionsReady)}</span></div>
        <div>Inspection suggestions: <span className="font-semibold text-white">{num(summary.inspectionSuggestionsReady)}</span></div>
        <div>Blocking issues: <span className="font-semibold text-white">{num(summary.blockingIssues)}</span></div>
        <div>Requires review: <span className="font-semibold text-white">{num(summary.reviewNeeded)}</span></div>
      </div>

      {preview?.risks?.length ? <ul className="mt-3 list-disc pl-5 text-xs text-amber-100/90">{preview.risks.slice(0, 5).map((risk, idx) => <li key={`${risk}-${idx}`}>{risk}</li>)}</ul> : null}
      {preview ? <p className="mt-2 text-[11px] text-amber-200/70">AI activation preview is advisory only; counts above are derived from persisted staged rows.</p> : null}

      <button onClick={() => setShowDevDetails((v) => !v)} className="mt-3 rounded border border-white/20 px-2 py-1 text-xs text-slate-200">{showDevDetails ? "Hide" : "Show"} developer details</button>
      {showDevDetails ? <pre className="mt-2 overflow-auto rounded-lg bg-slate-900/60 p-3 text-xs text-slate-200">{JSON.stringify({ latestPlan, agentPlan }, null, 2)}</pre> : null}
    </div>
  );
}
