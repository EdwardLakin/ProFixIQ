"use client";

import { useState } from "react";
import type { OnboardingAgentPlan } from "@/features/onboarding-agent/lib/agentPlanTypes";

export function OnboardingAgentInsightsPanel({
  report,
  fallbackReadiness,
}: {
  sessionId: string;
  report?: { mode?: string; summary?: string; model?: string | null; activationReadiness?: { status?: string } } | null;
  plan?: OnboardingAgentPlan | null;
  fallbackReadiness?: string;
  onRefresh: () => Promise<void>;
}) {
  const [showDev, setShowDev] = useState(false);
  const displayedReadiness = report?.activationReadiness?.status ?? fallbackReadiness ?? "not_ready";

  return (
    <div className="rounded-2xl border border-cyan-500/30 bg-cyan-950/10 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-cyan-100">Agent insights</h3>
          <p className="mt-1 text-xs text-cyan-100/70">No live records have been created. This is a staged analysis only.</p>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-white/10 bg-slate-900/50 p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Mode</p>
          <p className="text-sm text-white">{report?.mode === "ai_planned" ? "AI planned" : report?.mode === "deterministic_fallback" ? "Deterministic fallback" : "AI unavailable"}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-slate-900/50 p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Model</p>
          <p className="text-sm text-white">{report?.model ?? "n/a"}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-slate-900/50 p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Activation readiness</p>
          <p className="text-sm text-white">{displayedReadiness}</p>
        </div>
      </div>

      <p className="mt-3 text-sm text-slate-200">{report?.summary ?? "Run analysis to get onboarding understanding."}</p>

      <button onClick={() => setShowDev((v) => !v)} className="mt-3 text-xs text-cyan-200 underline">
        {showDev ? "Hide" : "Show"} developer details
      </button>
      {showDev ? (
        <pre className="mt-2 max-h-72 overflow-auto rounded bg-slate-900/70 p-3 text-[11px] text-slate-200">{JSON.stringify({ report }, null, 2)}</pre>
      ) : null}
    </div>
  );
}
