"use client";

import { useMemo, useState } from "react";
import type { OnboardingAgentReport } from "@/features/onboarding-agent/lib/agentTypes";

function readinessTone(status: OnboardingAgentReport["activationReadiness"]["status"] | undefined) {
  if (status === "ready_for_dry_run" || status === "activation_disabled") return "border-emerald-400/40 text-emerald-200";
  if (status === "review_required") return "border-amber-400/40 text-amber-200";
  return "border-rose-400/40 text-rose-200";
}

export function OnboardingAgentInsightsPanel({
  sessionId,
  report,
  onRefresh,
}: {
  sessionId: string;
  report?: OnboardingAgentReport | null;
  onRefresh: () => Promise<void>;
}) {
  const [running, setRunning] = useState(false);
  const findings = report?.findings ?? [];
  const recommendations = report?.recommendations ?? [];

  const groupedFindings = useMemo(() => {
    const buckets: Record<string, typeof findings> = {};
    for (const finding of findings) {
      buckets[finding.severity] = [...(buckets[finding.severity] ?? []), finding];
    }
    return buckets;
  }, [findings]);

  const groupedRecommendations = useMemo(() => {
    const buckets: Record<string, typeof recommendations> = {};
    for (const rec of recommendations) {
      const key = `${rec.actionType} • ${rec.domain}`;
      buckets[key] = [...(buckets[key] ?? []), rec];
    }
    return buckets;
  }, [recommendations]);

  const runAnalysis = async () => {
    setRunning(true);
    try {
      await fetch(`/api/onboarding-agent/sessions/${sessionId}/agent-analysis`, { method: "POST" });
      await onRefresh();
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="rounded-2xl border border-cyan-500/30 bg-cyan-950/10 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-cyan-100">Agent insights</h3>
          <p className="mt-1 text-xs text-cyan-100/70">No live records have been created. This is a staged analysis.</p>
        </div>
        <button onClick={runAnalysis} disabled={running} className="rounded border border-cyan-400/40 px-3 py-2 text-xs text-cyan-100 disabled:opacity-60">
          {running ? "Running..." : "Run AI analysis"}
        </button>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-white/10 bg-slate-900/50 p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Mode</p>
          <p className="text-sm text-white">
            {!report ? "Not run yet" : report.mode === "ai" ? "AI analysis" : "Deterministic fallback"}
          </p>
          {report?.mode === "deterministic_fallback" ? (
            <p className="mt-1 text-xs text-amber-200/90">AI reasoning unavailable; deterministic staging still completed.</p>
          ) : null}
        </div>
        <div className={`rounded-lg border bg-slate-900/50 p-3 ${readinessTone(report?.activationReadiness?.status)}`}>
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Activation readiness</p>
          <p className="text-sm">{report?.activationReadiness?.status ?? "not_ready"}</p>
        </div>
      </div>

      <p className="mt-3 text-sm text-slate-200">{report?.summary ?? "Run analysis to get explainable onboarding insights."}</p>

      {(report?.findings?.length ?? 0) > 0 ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Findings</p>
          {Object.entries(groupedFindings).map(([severity, findings]) => (
            <div key={severity} className="rounded-lg border border-white/10 bg-slate-900/50 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-400">{severity}</p>
              <ul className="mt-2 space-y-2 text-sm text-slate-200">
                {findings.map((finding, idx) => (
                  <li key={`${finding.title}-${idx}`}>
                    <p className="font-medium text-white">{finding.title}</p>
                    <p>{finding.explanation}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}

      {(report?.recommendations?.length ?? 0) > 0 ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Recommendations</p>
          {Object.entries(groupedRecommendations).map(([key, recs]) => (
            <div key={key} className="rounded-lg border border-white/10 bg-slate-900/50 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-400">{key}</p>
              <ul className="mt-2 space-y-2 text-sm text-slate-200">
                {recs.map((rec, idx) => (
                  <li key={`${rec.title}-${idx}`}>
                    <p className="font-medium text-white">{rec.title}</p>
                    <p>{rec.explanation}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
