import React from "react";
import type { AgentReadiness } from "@/features/onboarding-v2/lib/agentReadiness";

type ActivationSummary = { canConfirm?: boolean };

export function ConfirmActivationPanel({ readiness, summary }: { readiness: AgentReadiness; summary: ActivationSummary | null }) {
  const blockedByReadiness = readiness.rolloutStage === null || readiness.rolloutStage === "dry_run" || readiness.rolloutStage === "http_verify_only" || !readiness.connector.canWriteLive || !readiness.connector.liveMaterializationEnabled;
  const blocked = blockedByReadiness || summary?.canConfirm !== true;
  const reason = blockedByReadiness ? "Verify-only mode is active. Live activation is blocked until explicitly enabled." : "Activation checks are incomplete for this session.";

  return (
    <div className="rounded-xl border border-white/10 p-4">
      <div className="font-semibold">Confirm Activation</div>
      <button disabled={blocked} className="mt-2 rounded bg-slate-700 px-3 py-2 text-slate-300 disabled:cursor-not-allowed disabled:opacity-70">Confirm activation</button>
      {blocked ? <div className="mt-2 text-xs text-amber-200">{reason}</div> : null}
    </div>
  );
}
