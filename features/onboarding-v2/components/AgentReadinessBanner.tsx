import React from "react";
import type { AgentReadiness } from "@/features/onboarding-v2/lib/agentReadiness";

function statusLabel(readiness: AgentReadiness): string {
  if (!readiness.connector.configured) return "Disabled / not configured";
  if (!readiness.ok) return "Degraded";
  if (readiness.connector.liveMaterializationEnabled || readiness.connector.canWriteLive || readiness.rolloutStage === "live_enabled") return "Live-enabled (warning)";
  if (readiness.rolloutStage === "dry_run" || readiness.rolloutStage === "http_verify_only") return "Verify-only";
  return "Healthy";
}

export function AgentReadinessBanner({ readiness, loading, degradedMessage }: { readiness: AgentReadiness; loading?: boolean; degradedMessage?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/60 p-4 text-sm text-slate-200">
      <div className="font-semibold">Agent readiness: {loading ? "Loading…" : statusLabel(readiness)}</div>
      {degradedMessage ? <p className="mt-1 text-xs text-amber-300">{degradedMessage}</p> : null}
      <p className="mt-1 text-xs text-slate-400">Rollout stage: {readiness.rolloutStage ?? "unknown"} • Connector mode: {readiness.connector.mode}</p>
      {readiness.warnings.length > 0 ? <ul className="mt-2 list-disc pl-4 text-xs text-amber-200">{readiness.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}
    </div>
  );
}
