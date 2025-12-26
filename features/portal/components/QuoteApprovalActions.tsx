"use client";

import { useState } from "react";

type Props = {
  workOrderId: string;
  initialApprovalState: string | null;
};

const COPPER = "#C57A4A";

export default function QuoteApprovalActions({
  workOrderId,
  initialApprovalState,
}: Props) {
  const [approvalState, setApprovalState] = useState<string | null>(
    initialApprovalState,
  );
  const [loading, setLoading] = useState<"approved" | "declined" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const disabled = loading !== null;

  const runDecision = async (decision: "approved" | "declined") => {
    if (disabled) return;
    setLoading(decision);
    setError(null);

    try {
      const res = await fetch(
        `/api/portal/work-orders/${workOrderId}/approval`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision }),
        },
      );

      const json: { ok?: boolean; error?: string; approval_state?: string } =
        await res.json();

      if (!res.ok || !json.ok) {
        const msg = json.error ?? "Unable to update quote.";
        setError(msg);
        alert(msg);
        return;
      }

      setApprovalState(json.approval_state ?? decision);
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Unexpected error approving quote.";
      setError(msg);
      alert(msg);
    } finally {
      setLoading(null);
    }
  };

  const approved = approvalState === "approved";
  const declined = approvalState === "declined";

  return (
    <div className="mt-6 space-y-2">
      <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-400">
        Quote decision
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void runDecision("approved")}
          disabled={disabled || approved}
          className="
            inline-flex items-center justify-center rounded-full
            border border-emerald-400/70 bg-emerald-500/10
            px-4 py-1.5 text-xs font-semibold text-emerald-100
            shadow-[0_0_16px_rgba(16,185,129,0.35)]
            transition hover:bg-emerald-500/20 disabled:opacity-50
          "
        >
          {loading === "approved"
            ? "Approving…"
            : approved
              ? "Approved"
              : "Approve quote"}
        </button>

        <button
          type="button"
          onClick={() => void runDecision("declined")}
          disabled={disabled || declined}
          className="
            inline-flex items-center justify-center rounded-full
            border border-red-400/70 bg-red-500/10
            px-4 py-1.5 text-xs font-semibold text-red-100
            shadow-[0_0_16px_rgba(248,113,113,0.35)]
            transition hover:bg-red-500/20 disabled:opacity-50
          "
        >
          {loading === "declined"
            ? "Declining…"
            : declined
              ? "Declined"
              : "Decline quote"}
        </button>

        {approvalState && (
          <span className="ml-1 text-[11px] text-neutral-400">
            Current state:{" "}
            <span style={{ color: COPPER }} className="font-semibold">
              {approvalState}
            </span>
          </span>
        )}
      </div>

      {error && (
        <div className="text-[11px] text-red-300">
          {error}
        </div>
      )}
    </div>
  );
}