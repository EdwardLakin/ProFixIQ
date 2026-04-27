"use client";

import { useState } from "react";

function num(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function OnboardingActivationPlanPanel({ latestPlan, fallbackSummary }: { latestPlan?: Record<string, unknown> | null; fallbackSummary?: Record<string, unknown> | null }) {
  const [showDevDetails, setShowDevDetails] = useState(false);
  const summary = (latestPlan?.summary ?? latestPlan ?? fallbackSummary ?? {}) as Record<string, any>;

  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-4">
      <h3 className="text-sm font-semibold text-amber-100">Dry-run activation plan</h3>
      <p className="mt-2 text-xs text-amber-200/80">Activation remains disabled in this phase.</p>
      <p className="text-xs text-amber-200/80">No live records have been created.</p>
      <p className="text-xs text-amber-200/80">This plan is a preview only.</p>

      <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <div>Customers ready: <span className="font-semibold text-white">{num(summary.customersReady)}</span></div>
        <div>Vehicles ready: <span className="font-semibold text-white">{num(summary.vehiclesReady)}</span></div>
        <div>Historical work orders ready: <span className="font-semibold text-white">{num(summary.historicalWorkOrdersReady)}</span></div>
        <div>Historical invoices ready: <span className="font-semibold text-white">{num(summary.historicalInvoicesReady)}</span></div>
        <div>Parts ready: <span className="font-semibold text-white">{num(summary.partsReady)}</span></div>
        <div>Vendors ready: <span className="font-semibold text-white">{num(summary.vendorsReady)}</span></div>
        <div>Staff candidates ready: <span className="font-semibold text-white">{num(summary.staffCandidatesReady)}</span></div>
        <div>Menu suggestions ready: <span className="font-semibold text-white">{num(summary.menuSuggestionsReady)}</span></div>
        <div>Inspection suggestions ready: <span className="font-semibold text-white">{num(summary.inspectionSuggestionsReady)}</span></div>
        <div>Links ready: <span className="font-semibold text-white">{num(summary.linksReady)}</span></div>
        <div>Blocking issues: <span className="font-semibold text-white">{num(summary.blockingIssues)}</span></div>
        <div>Review needed: <span className="font-semibold text-white">{num(summary.reviewNeeded)}</span></div>
      </div>

      <button
        onClick={() => setShowDevDetails((v) => !v)}
        className="mt-3 rounded border border-white/20 px-2 py-1 text-xs text-slate-200"
      >
        {showDevDetails ? "Hide" : "Show"} developer details
      </button>
      {showDevDetails ? (
        <pre className="mt-2 overflow-auto rounded-lg bg-slate-900/60 p-3 text-xs text-slate-200">{JSON.stringify(latestPlan ?? summary ?? { status: "not_prepared" }, null, 2)}</pre>
      ) : null}
    </div>
  );
}
