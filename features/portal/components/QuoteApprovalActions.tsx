//features/portal/components/QuoteApprovalActions.tsx

"use client";

import { useMemo, useState } from "react";

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
  onChanged?: () => void;
};

const COPPER = "#C57A4A";

function safeTrim(x: unknown): string {
  return typeof x === "string" ? x.trim() : "";
}

function labelize(v: string | null | undefined): string {
  return (v ?? "").replaceAll("_", " ").trim() || "—";
}

function pillClass(approval: string | null) {
  const ap = safeTrim(approval).toLowerCase();
  if (ap === "approved") return "border-emerald-400/50 bg-emerald-500/10 text-emerald-100";
  if (ap === "declined") return "border-red-400/50 bg-red-500/10 text-red-100";
  return "border-amber-400/40 bg-amber-500/10 text-amber-100";
}

export default function QuoteApprovalActions({ workOrderId, lines, onChanged }: Props) {
  const [loadingLineId, setLoadingLineId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasLines = useMemo(() => Array.isArray(lines) && lines.length > 0, [lines]);

  const runDecision = async (lineId: string, decision: Decision) => {
    if (loadingLineId) return;

    setLoadingLineId(lineId);
    setError(null);

    try {
      const res = await fetch(`/api/portal/work-orders/${workOrderId}/line-decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lineId, decision }),
      });

      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;

      if (!res.ok || !json?.ok) {
        const msg = json?.error ?? "Unable to update line decision.";
        setError(msg);
        alert(msg);
        return;
      }

      onChanged?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unexpected error updating decision.";
      setError(msg);
      alert(msg);
    } finally {
      setLoadingLineId(null);
    }
  };

  if (!hasLines) {
    return (
      <div className="mt-6 space-y-2">
        <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-400">Quote decisions</div>
        <div className="text-xs text-neutral-400">
          No line items yet. Once your shop prepares the quote, you’ll be able to approve/decline items here.
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-3">
      <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-400">Quote decisions</div>

      <div className="space-y-2">
        {lines.map((l) => {
          const ap = l.approval_state ?? "pending";
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

                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] ${pillClass(
                        ap,
                      )}`}
                      style={{ color: COPPER }}
                      title={`approval_state=${ap} status=${l.status ?? "null"}`}
                    >
                      {labelize(ap)} • {labelize(l.status)}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void runDecision(l.id, "approve")}
                    disabled={!!loadingLineId || ap === "approved"}
                    className="
                      inline-flex items-center justify-center rounded-full
                      border border-emerald-400/70 bg-emerald-500/10
                      px-4 py-1.5 text-xs font-semibold text-emerald-100
                      shadow-[0_0_16px_rgba(16,185,129,0.25)]
                      transition hover:bg-emerald-500/20 disabled:opacity-50
                    "
                  >
                    {isBusy ? "Saving…" : ap === "approved" ? "Approved" : "Approve"}
                  </button>

                  <button
                    type="button"
                    onClick={() => void runDecision(l.id, "decline")}
                    disabled={!!loadingLineId || ap === "declined"}
                    className="
                      inline-flex items-center justify-center rounded-full
                      border border-red-400/70 bg-red-500/10
                      px-4 py-1.5 text-xs font-semibold text-red-100
                      shadow-[0_0_16px_rgba(248,113,113,0.25)]
                      transition hover:bg-red-500/20 disabled:opacity-50
                    "
                  >
                    {isBusy ? "Saving…" : ap === "declined" ? "Declined" : "Decline"}
                  </button>

                  <button
                    type="button"
                    onClick={() => void runDecision(l.id, "defer")}
                    disabled={!!loadingLineId || ap === "pending"}
                    className="
                      inline-flex items-center justify-center rounded-full
                      border border-amber-300/60 bg-amber-500/10
                      px-4 py-1.5 text-xs font-semibold text-amber-100
                      shadow-[0_0_16px_rgba(251,191,36,0.18)]
                      transition hover:bg-amber-500/20 disabled:opacity-50
                    "
                    title="Set this item back to pending"
                  >
                    {isBusy ? "Saving…" : "Defer"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {error && <div className="text-[11px] text-red-300">{error}</div>}
    </div>
  );
}