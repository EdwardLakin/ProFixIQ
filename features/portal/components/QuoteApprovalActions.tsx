"use client";

import { useState } from "react";
import StatusBadge from "@/features/shared/components/ui/StatusBadge";
import { formatDecisionStatus } from "@/features/shared/lib/decisionStatus";

type Decision = "approve" | "decline" | "defer";

type LineLite = {
  id: string;
  description: string | null;
  approval_state: "pending" | "approved" | "declined" | null;
  status: string | null;
};

type Props = {
  workOrderId: string;
  lines: LineLite[];
  onChanged?: () => void | Promise<void>;
};

export default function QuoteApprovalActions({ workOrderId, lines, onChanged }: Props) {
  const [loadingLineId, setLoadingLineId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runDecision = async (lineId: string, decision: Decision) => {
    if (!lineId || loadingLineId) return;

    setLoadingLineId(lineId);
    setError(null);

    try {
      const res = await fetch(`/api/work-orders/lines/${lineId}/approval-decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, workOrderId }),
        cache: "no-store",
      });

      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;

      if (!res.ok || !json?.ok) {
        setError(json?.error ?? "Unable to update line decision.");
        return;
      }

      await onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error updating decision.");
    } finally {
      setLoadingLineId(null);
    }
  };

  if (!Array.isArray(lines) || lines.length === 0) {
    return null;
  }

  return (
    <div className="mt-6 space-y-3">
      <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-400">
        Approvals
      </div>
      <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs text-neutral-400">
        For each recommendation: confirm the issue, review evidence, then choose Approve or Decline.
      </div>

      <div className="space-y-2">
        {lines.map((l) => {
          const ap = l.approval_state ?? "pending";
          const decisionStatus = formatDecisionStatus({
            approvalState: l.approval_state,
            workStatus: l.status,
          });
          const isBusy = loadingLineId === l.id;

          return (
            <div
              key={l.id}
              className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="truncate text-sm font-semibold text-neutral-100">
                      {l.description?.trim() || "Line item"}
                    </div>

                    <StatusBadge variant={decisionStatus.variant}>
                      {decisionStatus.label}
                    </StatusBadge>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void runDecision(l.id, "approve")}
                    disabled={!!loadingLineId || ap === "approved"}
                    className="inline-flex items-center justify-center rounded-full border border-emerald-400/70 bg-emerald-500/15 px-4 py-1.5 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/25 disabled:opacity-50"
                  >
                    {isBusy ? "Saving..." : ap === "approved" ? "Approved" : "Approve"}
                  </button>

                  <button
                    type="button"
                    onClick={() => void runDecision(l.id, "decline")}
                    disabled={!!loadingLineId || ap === "declined"}
                    className="inline-flex items-center justify-center rounded-full border border-white/20 bg-black/45 px-4 py-1.5 text-xs font-semibold text-neutral-100 transition hover:bg-black/65 disabled:opacity-50"
                  >
                    {isBusy ? "Saving..." : ap === "declined" ? "Declined" : "Decline"}
                  </button>

                  <button
                    type="button"
                    onClick={() => void runDecision(l.id, "defer")}
                    disabled={!!loadingLineId || ap === "pending"}
                    className="inline-flex items-center justify-center rounded-full border border-white/15 bg-transparent px-3 py-1.5 text-[11px] font-medium text-neutral-300 transition hover:bg-white/5 disabled:opacity-50"
                  >
                    {isBusy ? "Saving..." : "Defer"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {error ? <div className="text-[11px] text-red-300">{error}</div> : null}
    </div>
  );
}
