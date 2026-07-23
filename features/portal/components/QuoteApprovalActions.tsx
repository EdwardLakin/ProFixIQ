"use client";

import { useMemo, useRef, useState } from "react";
import StatusBadge from "@/features/shared/components/ui/StatusBadge";
import { formatDecisionStatus } from "@/features/shared/lib/decisionStatus";

type Decision = "approve" | "decline" | "defer";
type ApprovalState = "pending" | "approved" | "declined" | "deferred" | null;

type LineLite = {
  id: string;
  description: string | null;
  approval_state: ApprovalState;
  status: string | null;
};

type Props = {
  workOrderId: string;
  lines: LineLite[];
  onChanged?: () => void | Promise<void>;
};

function decisionLabel(decision: Decision): string {
  if (decision === "approve") return "Approve";
  if (decision === "decline") return "Decline";
  return "Defer";
}

function completedDecisionLabel(decision: Decision): string {
  if (decision === "approve") return "Approved";
  if (decision === "decline") return "Declined";
  return "Deferred";
}

function approvalStateForDecision(decision: Decision): Exclude<ApprovalState, null> {
  if (decision === "approve") return "approved";
  if (decision === "decline") return "declined";
  return "deferred";
}

export default function QuoteApprovalActions({ workOrderId, lines, onChanged }: Props) {
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const operationKeys = useRef(new Map<string, string>());

  const pendingLines = useMemo(
    () => lines.filter((line) => (line.approval_state ?? "pending") === "pending"),
    [lines],
  );

  const runDecision = async (lineIds: string[], decision: Decision, declineRemaining = false) => {
    const ids = lineIds.map((id) => id.trim()).filter(Boolean);
    if (ids.length === 0 || loadingKey) return;

    const key = ids.length === 1 ? ids[0] : `${decision}-bulk`;
    const actionIdentity = `${workOrderId}:${decision}:${[...ids].sort().join(",")}:${declineRemaining}`;
    const operationKey = operationKeys.current.get(actionIdentity) ?? crypto.randomUUID();
    operationKeys.current.set(actionIdentity, operationKey);
    setLoadingKey(key);
    setError(null);

    try {
      const res = await fetch(`/api/work-orders/quotes/${ids[0]}/approval-decision`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": operationKey,
        },
        body: JSON.stringify({ decision, lineIds: ids, workOrderId, declineRemaining, operationKey }),
        cache: "no-store",
      });

      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;

      if (!res.ok || !json?.ok) {
        setError(json?.error ?? "Unable to update quote decision.");
        return;
      }

      operationKeys.current.delete(actionIdentity);
      await onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error updating decision.");
    } finally {
      setLoadingKey(null);
    }
  };

  if (!Array.isArray(lines) || lines.length === 0) {
    return null;
  }

  return (
    <div className="mt-6 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
          Approvals
        </div>
        {pendingLines.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void runDecision(pendingLines.map((line) => line.id), "approve")}
              disabled={!!loadingKey}
              className="inline-flex items-center justify-center rounded-full border border-emerald-400/70 bg-emerald-500/15 px-4 py-1.5 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/25 disabled:opacity-50"
            >
              {loadingKey === "approve-bulk" ? "Saving..." : `Approve all (${pendingLines.length})`}
            </button>
            <button
              type="button"
              onClick={() => void runDecision(pendingLines.map((line) => line.id), "decline")}
              disabled={!!loadingKey}
              className="inline-flex items-center justify-center rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-1.5 text-xs font-semibold text-[color:var(--theme-text-primary)] transition hover:bg-[color:var(--theme-surface-overlay)] disabled:opacity-50"
            >
              {loadingKey === "decline-bulk" ? "Saving..." : `Decline all (${pendingLines.length})`}
            </button>
            <button
              type="button"
              onClick={() => void runDecision(pendingLines.map((line) => line.id), "defer")}
              disabled={!!loadingKey}
              className="inline-flex items-center justify-center rounded-full border border-[color:var(--theme-border-soft)] bg-transparent px-4 py-1.5 text-xs font-semibold text-[color:var(--theme-text-primary)] transition hover:bg-[color:var(--theme-surface-subtle)] disabled:opacity-50"
            >
              {loadingKey === "defer-bulk" ? "Saving..." : `Defer all (${pendingLines.length})`}
            </button>
          </div>
        ) : null}
      </div>
      <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-xs text-[color:var(--theme-text-secondary)]">
        Approving a quote item authorizes the shop to perform that work. Declined or deferred items stay on the quote and do not become punchable work.
      </div>

      <div className="space-y-2">
        {lines.map((l) => {
          const ap = l.approval_state ?? "pending";
          const decisionStatus = formatDecisionStatus({
            approvalState: ap === "deferred" ? "pending" : ap,
            workStatus: l.status,
          });
          const isBusy = loadingKey === l.id;

          return (
            <div
              key={l.id}
              className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="truncate text-sm font-semibold text-[color:var(--theme-text-primary)]">
                      {l.description?.trim() || "Quote item"}
                    </div>

                    <StatusBadge variant={decisionStatus.variant}>
                      {ap === "deferred" ? "Deferred" : decisionStatus.label}
                    </StatusBadge>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {(["approve", "decline", "defer"] as Decision[]).map((decision) => {
                    const disabled =
                      !!loadingKey ||
                      (decision === "approve" && ap === "approved") ||
                      (decision === "decline" && ap === "declined") ||
                      (decision === "defer" && ap === "deferred");
                    const isPrimaryApprove = decision === "approve";
                    return (
                      <button
                        key={decision}
                        type="button"
                        onClick={() => void runDecision([l.id], decision)}
                        disabled={disabled}
                        className={
                          isPrimaryApprove
                            ? "inline-flex items-center justify-center rounded-full border border-emerald-400/70 bg-emerald-500/15 px-4 py-1.5 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/25 disabled:opacity-50"
                            : "inline-flex items-center justify-center rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-1.5 text-xs font-semibold text-[color:var(--theme-text-primary)] transition hover:bg-[color:var(--theme-surface-overlay)] disabled:opacity-50"
                        }
                      >
                        {isBusy ? "Saving..." : ap === approvalStateForDecision(decision) ? completedDecisionLabel(decision) : decisionLabel(decision)}
                      </button>
                    );
                  })}
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
