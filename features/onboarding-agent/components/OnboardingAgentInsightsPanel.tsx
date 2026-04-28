"use client";

import { useState } from "react";
import type { OnboardingAgentPlan } from "@/features/onboarding-agent/lib/agentPlanTypes";

export function agentInsightsStateCopy(started: boolean): string {
  return started
    ? "Activation has started. Some records may have been created or matched. Historical work orders remain closed/historical and invoices remain staged."
    : "No live records have been created yet. This is staged analysis only.";
}

export function OnboardingAgentInsightsPanel({
  report,
  plan,
  fallbackReadiness,
  summary,
  activationState,
}: {
  report?: { mode?: string; summary?: string; model?: string | null; activationReadiness?: { status?: string } } | null;
  plan?: OnboardingAgentPlan | null;
  fallbackReadiness?: string;
  summary?: Record<string, unknown> | null;
  activationState?: {
    started: boolean;
    customersVehicles: "activated" | "matched" | "not_run";
    vendors: "activated" | "matched" | "not_run";
    parts: "activated" | "matched" | "not_run";
    history: "activated" | "matched" | "not_run";
  };
}) {
  const [showDev, setShowDev] = useState(false);
  const displayedReadiness = report?.activationReadiness?.status ?? fallbackReadiness ?? "not_ready";
  const usingFallback = report?.mode === "deterministic_fallback";
  const aiRowsSampled = Number(summary?.aiRowsSampled ?? 0);
  const rowsParsed = Number(summary?.rowsParsedTotal ?? summary?.rowsParsed ?? 0);
  const effectiveFileMappings = Array.isArray(summary?.effectiveFileMappings) ? summary.effectiveFileMappings as Array<Record<string, unknown>> : [];
  const filePipelineTraces = Array.isArray(summary?.filePipelineTraces) ? summary.filePipelineTraces as Array<Record<string, unknown>> : [];
  const effectiveByFileId = new Map(effectiveFileMappings.map((item) => [String(item.fileId ?? ""), item]));
  const traceByFileId = new Map(filePipelineTraces.map((item) => [String(item.fileId ?? ""), item]));

  return (
    <div className="rounded-2xl border border-cyan-500/30 bg-cyan-950/10 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-cyan-100">Agent insights</h3>
          <p className="mt-1 text-xs text-cyan-100/70">
            {agentInsightsStateCopy(Boolean(activationState?.started))}
          </p>
          <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-cyan-100/85">
            <span className="rounded border border-cyan-500/30 px-2 py-0.5">Customers/vehicles: {activationState?.customersVehicles ?? "not_run"}</span>
            <span className="rounded border border-cyan-500/30 px-2 py-0.5">Vendors: {activationState?.vendors ?? "not_run"}</span>
            <span className="rounded border border-cyan-500/30 px-2 py-0.5">Parts: {activationState?.parts ?? "not_run"}</span>
            <span className="rounded border border-cyan-500/30 px-2 py-0.5">History: {activationState?.history ?? "not_run"}</span>
            <span className="rounded border border-amber-500/40 px-2 py-0.5 text-amber-100">Invoices: staged only</span>
          </div>
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

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <p className="rounded border border-white/10 bg-slate-900/50 px-3 py-2 text-xs text-slate-200">Rows parsed: <span className="font-semibold text-white">{rowsParsed.toLocaleString()}</span></p>
        <p className="rounded border border-white/10 bg-slate-900/50 px-3 py-2 text-xs text-slate-200">AI sampled rows: <span className="font-semibold text-white">{aiRowsSampled.toLocaleString()}</span></p>
      </div>

      <p className="mt-3 text-sm text-slate-200">{report?.summary ?? "Run analysis to get onboarding understanding."}</p>
      {usingFallback ? <p className="mt-2 text-xs text-amber-200">Warning: AI output fell back to deterministic planning for one or more files.</p> : null}

      {plan?.files?.length ? (
        <div className="mt-3 rounded-lg border border-white/10 bg-slate-900/50 p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Per-file AI plan and persisted execution</p>
          <ul className="mt-2 space-y-1 text-xs text-slate-200">
            {plan.files.slice(0, 12).map((file) => {
              const mappedEntries = Object.entries(file.headerMap ?? {});
              const effective = effectiveByFileId.get(file.fileId);
              const trace = traceByFileId.get(file.fileId);
              const topReviewCodes = trace?.reviewIssueCountsByCode && typeof trace.reviewIssueCountsByCode === "object"
                ? Object.entries(trace.reviewIssueCountsByCode as Record<string, number>).sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, 3)
                : [];
              return (
                <li key={file.fileId} className="rounded border border-white/10 px-2 py-1">
                  <p className="text-white">{file.filename}</p>
                  <p>AI domain: {file.inferredDomain} • {file.recommendedParserMode} • {Math.round(file.confidence * 100)}%</p>
                  {trace ? <p className="text-cyan-100/90">Final domain used: {String(trace.finalDomainUsed ?? "unknown")}</p> : null}
                  <p className="text-slate-400">AI map: {mappedEntries.length} columns • source: {file.mappingSource ?? "none"}</p>
                  {effective ? (
                    <p className="text-cyan-200/90">
                      Effective map: {Number(effective.mappedColumnCount ?? 0)} columns • source: {String(effective.mappingSource ?? "none")}
                    </p>
                  ) : null}
                  {trace ? (
                    <p className="text-emerald-200/90">
                      Persisted: {Number(trace.readyCount ?? 0)} ready, {Number(trace.reviewCount ?? 0)} review, {Math.max(0, Number(trace.rowCountTotal ?? 0) - Number(trace.persistedEntityCount ?? 0))} skipped
                    </p>
                  ) : null}
                  {topReviewCodes.length ? <p className="text-amber-200/90">top review codes: {topReviewCodes.map(([code, count]) => `${code} (${count})`).join(", ")}</p> : null}
                  {file.missingImportantFields.length ? <p className="text-amber-200/90">missing: {file.missingImportantFields.slice(0, 4).join(", ")}</p> : null}
                  {trace ? (
                    <details className="mt-1 text-slate-300">
                      <summary className="cursor-pointer">view trace</summary>
                      <pre className="mt-1 overflow-auto rounded bg-slate-950/60 p-2 text-[11px]">{JSON.stringify(trace, null, 2)}</pre>
                    </details>
                  ) : null}
                  {mappedEntries.length ? (
                    <details className="mt-1 text-slate-400">
                      <summary className="cursor-pointer">mapping details</summary>
                      <ul className="mt-1 space-y-0.5 text-[11px]">
                        {mappedEntries.slice(0, 8).map(([sourceHeader, canonicalField]) => <li key={`${file.fileId}-${sourceHeader}`}>{canonicalField} ← {sourceHeader}</li>)}
                      </ul>
                    </details>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <button onClick={() => setShowDev((v) => !v)} className="mt-3 text-xs text-cyan-200 underline">
        {showDev ? "Hide" : "Show"} developer details
      </button>
      {showDev ? (
        <pre className="mt-2 max-h-72 overflow-auto rounded bg-slate-900/70 p-3 text-[11px] text-slate-200">{JSON.stringify({ report, plan }, null, 2)}</pre>
      ) : null}
    </div>
  );
}
