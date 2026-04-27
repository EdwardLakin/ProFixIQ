"use client";

import { useState } from "react";
import type { OnboardingAgentPlan } from "@/features/onboarding-agent/lib/agentPlanTypes";

function num(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function OnboardingActivationPlanPanel({ latestPlan, fallbackSummary, agentPlan }: { latestPlan?: Record<string, unknown> | null; fallbackSummary?: Record<string, unknown> | null; agentPlan?: OnboardingAgentPlan | null }) {
  const [showDevDetails, setShowDevDetails] = useState(false);
  const summary = (latestPlan?.summary ?? latestPlan ?? fallbackSummary ?? {}) as Record<string, any>;
  const preview = agentPlan?.activationPreview;

  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-4">
      <h3 className="text-sm font-semibold text-amber-100">Dry-run activation preview</h3>
      <p className="mt-2 text-xs text-amber-200/80">No live records have been created. This is dry-run only.</p>

      <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <div>Customers: <span className="font-semibold text-white">{num(preview?.creates.customers ?? summary.customersReady)}</span></div>
        <div>Vehicles: <span className="font-semibold text-white">{num(preview?.creates.vehicles ?? summary.vehiclesReady)}</span></div>
        <div>Historical work orders: <span className="font-semibold text-white">{num(preview?.creates.historicalWorkOrders ?? summary.historicalWorkOrdersReady)}</span></div>
        <div>Historical invoices: <span className="font-semibold text-white">{num(preview?.creates.historicalInvoices ?? summary.historicalInvoicesReady)}</span></div>
        <div>Parts: <span className="font-semibold text-white">{num(preview?.creates.parts ?? summary.partsReady)}</span></div>
        <div>Vendors: <span className="font-semibold text-white">{num(preview?.creates.vendors ?? summary.vendorsReady)}</span></div>
        <div>Staff candidates: <span className="font-semibold text-white">{num(preview?.creates.staffCandidates ?? summary.staffCandidatesReady)}</span></div>
        <div>Menu suggestions: <span className="font-semibold text-white">{num(preview?.creates.menuSuggestions ?? summary.menuSuggestionsReady)}</span></div>
        <div>Inspection suggestions: <span className="font-semibold text-white">{num(preview?.creates.inspectionSuggestions ?? summary.inspectionSuggestionsReady)}</span></div>
        <div>Blocking issues: <span className="font-semibold text-white">{num(preview?.blockingIssues ?? summary.blockingIssues)}</span></div>
        <div>Requires review: <span className="font-semibold text-white">{num(preview?.requiresReview ?? summary.reviewNeeded)}</span></div>
      </div>

      {preview?.risks?.length ? <ul className="mt-3 list-disc pl-5 text-xs text-amber-100/90">{preview.risks.slice(0, 5).map((risk, idx) => <li key={`${risk}-${idx}`}>{risk}</li>)}</ul> : null}

      <button onClick={() => setShowDevDetails((v) => !v)} className="mt-3 rounded border border-white/20 px-2 py-1 text-xs text-slate-200">{showDevDetails ? "Hide" : "Show"} developer details</button>
      {showDevDetails ? <pre className="mt-2 overflow-auto rounded-lg bg-slate-900/60 p-3 text-xs text-slate-200">{JSON.stringify({ latestPlan, agentPlan }, null, 2)}</pre> : null}
    </div>
  );
}
