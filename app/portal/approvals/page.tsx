// app/portal/approvals/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Toaster, toast } from "sonner";
import StatusBadge from "@/features/shared/components/ui/StatusBadge";
import DecisionTimeline, {
  type DecisionTimelineStage,
} from "@/features/shared/components/ui/DecisionTimeline";
import DecisionEventFeed from "@/features/shared/components/ui/DecisionEventFeed";
import {
  formatDecisionStatus,
  getDecisionStatusView,
  resolveDecisionStatus,
} from "@/features/shared/lib/decisionStatus";
import { deriveEventsFromPortalApproval } from "@/features/shared/lib/decisionEvents";

const COPPER = "#C57A4A";

type ApprovalItem = {
  id: string;
  description: string | null;
  qty: number | null;
  vendor: string | null;
  quoted_price: number | null;
  approved: boolean | null;
  request_id: string | null;
  work_order_line_id: string | null;
};

type ApprovalLine = {
  id: string; // work_order_lines.id
  description: string | null;
  complaint: string | null;
  approval_state: string | null;
  status: string | null;
  hold_reason: string | null;
  work_order_id: string;
  created_at: string | null;
  updated_at?: string | null;

  // joined
  work_orders: {
    id: string;
    custom_id: string | null;
    created_at: string | null;
    customer_id: string | null;
  };

  part_request_items: ApprovalItem[];
};

type PartRequestHeader = {
  id: string;
  status: string | null;
  created_at: string | null;
};

type ApprovalsPayload = {
  lines: ApprovalLine[];
  partRequestHeaders: PartRequestHeader[];
};

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function fmtMoney(n: number | null | undefined) {
  if (typeof n !== "number" || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

async function readJson(res: Response): Promise<unknown> {
  const txt = await res.text();
  if (!txt) return null;
  try {
    return JSON.parse(txt) as unknown;
  } catch {
    return txt; // return raw text if not JSON
  }
}

function safePayload(v: unknown): ApprovalsPayload {
  if (!isRecord(v)) return { lines: [], partRequestHeaders: [] };

  const linesRaw = v.lines;
  const headersRaw = v.partRequestHeaders;

  const lines = Array.isArray(linesRaw) ? (linesRaw as ApprovalLine[]) : [];
  const partRequestHeaders = Array.isArray(headersRaw)
    ? (headersRaw as PartRequestHeader[])
    : [];

  return { lines, partRequestHeaders };
}

export default function PortalApprovalsPage() {
  const router = useRouter();

  const [lines, setLines] = useState<ApprovalLine[]>([]);
  const [headers, setHeaders] = useState<PartRequestHeader[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);

  const fetchApprovals = async (opts?: { silent?: boolean }) => {
    const silent = Boolean(opts?.silent);
    if (!silent) setLoading(true);
    else setRefreshing(true);

    setError(null);
    try {
      const res = await fetch("/api/portal/approvals", { method: "GET", cache: "no-store" });
      const parsed = await readJson(res);

      if (!res.ok) {
        const msg =
          (isRecord(parsed) && typeof parsed.error === "string" && parsed.error) ||
          (typeof parsed === "string" ? parsed : null) ||
          `Failed to load approvals (status ${res.status})`;

        setError(msg);
        setLines([]);
        setHeaders([]);
        return;
      }

      const payload = safePayload(parsed);
      setLines(payload.lines);
      setHeaders(payload.partRequestHeaders);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load approvals");
      setLines([]);
      setHeaders([]);
    } finally {
      if (!silent) setLoading(false);
      else setRefreshing(false);
    }
  };

  useEffect(() => {
    void fetchApprovals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flattenedCount = useMemo(() => {
    let n = 0;
    lines.forEach((ln) => (n += Array.isArray(ln.part_request_items) ? ln.part_request_items.length : 0));
    return n;
  }, [lines]);

  const runLineDecision = async (
    itemId: string,
    lineId: string | null | undefined,
    workOrderId: string,
    decision: "approve" | "decline",
  ) => {
    if (!itemId || !lineId || !workOrderId || busyItemId) return;
    setBusyItemId(itemId);

    try {
      const res = await fetch(`/api/work-orders/lines/${encodeURIComponent(lineId)}/approval-decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ decision, workOrderId }),
      });

      const parsed = await readJson(res);
      if (!res.ok) {
        const msg =
          (isRecord(parsed) && typeof parsed.error === "string" && parsed.error) ||
          (typeof parsed === "string" ? parsed : null) ||
          `${decision === "approve" ? "Approve" : "Decline"} failed (${res.status})`;

        toast.error(msg);
        return;
      }

      toast.success(decision === "approve" ? "Approved" : "Declined");
      await fetchApprovals({ silent: true });
    } catch (e: unknown) {
      toast.error(
        e instanceof Error
          ? e.message
          : decision === "approve"
            ? "Approve failed"
            : "Decline failed",
      );
    } finally {
      setBusyItemId(null);
    }
  };

  const lineSummary = (ln: ApprovalLine) => {
    const items = Array.isArray(ln.part_request_items) ? ln.part_request_items : [];
    if (items.length === 0) return getDecisionStatusView("recommended");

    const approvedCount = items.filter((it) => Boolean(it.approved)).length;
    if (approvedCount === 0) return getDecisionStatusView("awaiting_approval");
    if (approvedCount === items.length) return getDecisionStatusView("approved");
    return getDecisionStatusView("in_progress");
  };

  const shell =
    "rounded-3xl border border-white/10 bg-black/25 p-4 backdrop-blur-md shadow-card sm:p-6";
  const glass =
    "rounded-2xl border border-white/10 bg-black/25 backdrop-blur-md shadow-card";
  const metalHeader =
    "rounded-2xl border border-white/10 bg-gradient-to-r from-slate-900/70 via-black/40 to-black/60 px-4 py-3";

  return (
    <div className="min-h-dvh app-metal-bg text-white">
      <Toaster position="top-center" />
      <div className="mx-auto w-full max-w-5xl px-3 py-4 md:px-6">
        <div className={shell}>
          <div className={cx(metalHeader, "flex items-start justify-between gap-3")}>
            <div className="min-w-0">
              <div className="font-blackops text-[0.9rem] tracking-[0.18em]" style={{ color: COPPER }}>
                APPROVALS
              </div>
              <div className="mt-1 text-xs text-neutral-300">
                Review and approve parts for jobs awaiting your confirmation.
              </div>
              <div className="mt-2 text-[0.7rem] text-neutral-400">
                When all items on a job are approved, the job automatically moves forward.
              </div>
            </div>

            <div className="flex shrink-0 flex-col items-end gap-2">
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-white/12 bg-black/40 px-3 py-1 text-[0.7rem] text-neutral-200">
                  {lines.length} jobs
                </span>
                <span className="rounded-full border border-white/12 bg-black/40 px-3 py-1 text-[0.7rem] text-neutral-200">
                  {flattenedCount} items
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void fetchApprovals({ silent: true })}
                  disabled={loading || refreshing}
                  className="inline-flex items-center rounded-full border border-white/18 bg-black/40 px-3 py-1 text-[0.7rem] font-semibold text-neutral-100 transition hover:bg-black/70 active:scale-95 disabled:opacity-60"
                >
                  {refreshing ? "Refreshing…" : "Refresh"}
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/portal")}
                  className="inline-flex items-center rounded-full border border-white/18 bg-black/40 px-3 py-1 text-[0.7rem] font-semibold text-neutral-100 transition hover:bg-black/70 active:scale-95"
                >
                  Home
                </button>
              </div>
            </div>
          </div>

          {error ? (
            <div className="mt-4 rounded-2xl border border-red-400/40 bg-red-500/10 p-4">
              <div className="text-sm font-semibold text-red-100">Error</div>
              <div className="mt-1 whitespace-pre-wrap text-xs text-red-200">{error}</div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => void fetchApprovals()}
                  className="inline-flex items-center rounded-full border border-red-400/40 bg-black/40 px-4 py-2 text-xs font-semibold text-red-100 hover:bg-black/70"
                >
                  Try again
                </button>
              </div>
            </div>
          ) : null}

          {loading && !error ? (
            <div className="mt-4 grid gap-3">
              <div className="h-24 rounded-2xl border border-white/10 bg-black/25 animate-pulse" />
              <div className="h-24 rounded-2xl border border-white/10 bg-black/25 animate-pulse" />
              <div className="h-24 rounded-2xl border border-white/10 bg-black/25 animate-pulse" />
            </div>
          ) : null}

          {!loading && !error && lines.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-6 text-center">
              <div className="text-sm font-semibold text-neutral-100">Nothing to approve</div>
              <div className="mt-1 text-xs text-neutral-400">
                You don’t have any jobs waiting for approval right now.
              </div>
              <div className="mt-4 flex justify-center gap-2">
                <button
                  type="button"
                  onClick={() => router.push("/portal")}
                  className="inline-flex items-center rounded-full border border-white/18 bg-black/40 px-4 py-2 text-xs font-semibold text-neutral-100 hover:bg-black/70"
                >
                  Back to portal
                </button>
                <button
                  type="button"
                  onClick={() => void fetchApprovals({ silent: true })}
                  className="inline-flex items-center rounded-full border border-white/18 bg-black/40 px-4 py-2 text-xs font-semibold text-neutral-100 hover:bg-black/70"
                >
                  Refresh
                </button>
              </div>
            </div>
          ) : null}

          {!loading && !error && lines.length > 0 ? (
            <div className="mt-4 space-y-3">
              {lines.map((ln) => {
                const title = (ln.description ?? ln.complaint ?? "Job").trim();
                const summary = lineSummary(ln);
                const items = Array.isArray(ln.part_request_items) ? ln.part_request_items : [];
                const lineDecisionStatus = formatDecisionStatus({
                  approvalState: ln.approval_state,
                  workStatus: ln.status,
                });
                const timelineStages: DecisionTimelineStage[] = [
                  { key: "inspection", label: "Inspection completed", state: "past" },
                  { key: "recommendation", label: "Recommendation issued", state: "past" },
                  {
                    key: "approval",
                    label: "Awaiting approval",
                    state:
                      resolveDecisionStatus({
                        approvalState: ln.approval_state,
                        workStatus: ln.status,
                      }) === "awaiting_approval"
                        ? "current"
                        : resolveDecisionStatus({
                              approvalState: ln.approval_state,
                              workStatus: ln.status,
                            }) === "approved"
                          ? "past"
                          : "future",
                  },
                  {
                    key: "execution",
                    label: "Work started",
                    state:
                      resolveDecisionStatus({
                        approvalState: ln.approval_state,
                        workStatus: ln.status,
                      }) === "in_progress"
                        ? "current"
                        : resolveDecisionStatus({
                              approvalState: ln.approval_state,
                              workStatus: ln.status,
                            }) === "completed"
                          ? "past"
                          : "future",
                  },
                ];
                const decisionEvents = deriveEventsFromPortalApproval({
                  line: {
                    id: ln.id,
                    description: ln.description,
                    complaint: ln.complaint,
                    created_at: ln.created_at,
                    updated_at: ln.updated_at ?? null,
                    approval_state: ln.approval_state,
                    status: ln.status,
                  },
                  actorLabel: "Customer portal",
                });

                return (
                  <div key={ln.id} className={glass}>
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 px-4 py-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="truncate text-sm font-semibold text-neutral-100">{title}</div>
                          <StatusBadge variant={summary.variant}>{summary.label}</StatusBadge>
                        </div>
                        <div className="mt-2 text-xs text-neutral-300">
                          Decision needed: approve required parts so this work order can continue.
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[0.7rem] text-neutral-400">
                          <span className="rounded-full border border-white/10 bg-black/35 px-2 py-0.5">
                            Work: {lineDecisionStatus.label}
                          </span>
                          <span className="rounded-full border border-white/10 bg-black/35 px-2 py-0.5">
                            Approval: {formatDecisionStatus({ approvalState: ln.approval_state }).label}
                          </span>
                          {ln.hold_reason ? (
                            <span className="rounded-full border border-white/10 bg-black/35 px-2 py-0.5">
                              Hold: {ln.hold_reason}
                            </span>
                          ) : null}
                          <span className="rounded-full border border-white/10 bg-black/35 px-2 py-0.5">
                            Created: {fmtDate(ln.created_at)}
                          </span>
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <div className="text-[0.65rem] text-neutral-400 uppercase tracking-[0.18em]">
                          Work order
                        </div>
                        <div className="mt-1 rounded-full border border-white/12 bg-black/40 px-3 py-1 font-mono text-[0.7rem] text-neutral-100">
                          {ln.work_order_id}
                        </div>
                      </div>
                    </div>

                    <div className="px-4 py-4">
                      <DecisionTimeline stages={timelineStages} orientation="vertical" className="mb-3" />
                      <DecisionEventFeed events={decisionEvents} compact className="mb-3" maxVisible={4} />
                      <div className="mb-2 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
                        <div>
                          <div className="text-[0.75rem] font-semibold uppercase tracking-[0.18em] text-neutral-300">
                            Evidence-backed recommendation
                          </div>
                          <div className="text-[0.7rem] text-neutral-500">
                            Review pricing and approve each required part. This is the action step for this job.
                          </div>
                        </div>
                        <div className="text-[0.68rem] text-neutral-400">
                          Primary action: <span className="text-neutral-200">Approve</span>
                        </div>
                      </div>

                      <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/35">
                        <div className="grid grid-cols-12 gap-2 border-b border-white/10 bg-black/45 px-3 py-2 text-[0.65rem] uppercase tracking-[0.16em] text-neutral-400">
                          <div className="col-span-6">Description</div>
                          <div className="col-span-1 text-right">Qty</div>
                          <div className="col-span-2">Vendor</div>
                          <div className="col-span-2 text-right">Price</div>
                          <div className="col-span-1 text-right"> </div>
                        </div>

                        <div className="divide-y divide-white/5">
                          {items.length === 0 ? (
                            <div className="px-3 py-3 text-xs text-neutral-400">
                              No part items found for this job.
                            </div>
                          ) : (
                            items.map((it) => {
                              const approved = Boolean(it.approved);
                              const isBusy = busyItemId === it.id;

                              return (
                                <div key={it.id} className="grid grid-cols-12 gap-2 px-3 py-3">
                                  <div className="col-span-6 min-w-0">
                                    <div className="truncate text-sm text-neutral-100">
                                      {it.description ?? "—"}
                                    </div>
                                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[0.7rem] text-neutral-400">
                                      <span
                                        className={cx(
                                          "rounded-full border px-2 py-0.5",
                                          approved
                                            ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-100"
                                            : "border-white/10 bg-black/40 text-neutral-300",
                                        )}
                                      >
                                        {approved ? "Approved" : "Awaiting approval"}
                                      </span>
                                    </div>
                                  </div>

                                  <div className="col-span-1 text-right text-sm text-neutral-100">
                                    {it.qty ?? 1}
                                  </div>

                                  <div className="col-span-2 text-sm text-neutral-200">
                                    {it.vendor ?? "—"}
                                  </div>

                                  <div className="col-span-2 text-right text-sm text-neutral-100">
                                    {fmtMoney(it.quoted_price)}
                                  </div>

                                  <div className="col-span-1 flex items-center justify-end gap-2">
                                    {!approved ? (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          void runLineDecision(
                                            it.id,
                                            it.work_order_line_id ?? ln.id,
                                            ln.work_order_id,
                                            "approve",
                                          )
                                        }
                                        disabled={isBusy}
                                        className="inline-flex items-center rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-emerald-100 transition hover:bg-emerald-500/20 active:scale-95 disabled:opacity-60"
                                        title="Approve item"
                                      >
                                        {isBusy ? "..." : "Approve"}
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          void runLineDecision(
                                            it.id,
                                            it.work_order_line_id ?? ln.id,
                                            ln.work_order_id,
                                            "decline",
                                          )
                                        }
                                        disabled={isBusy}
                                        className="inline-flex items-center rounded-full border border-red-400/40 bg-red-500/10 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-red-100 transition hover:bg-red-500/20 active:scale-95 disabled:opacity-60"
                                        title="Undo approval"
                                      >
                                        {isBusy ? "..." : "Decline"}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>

                      <div className="mt-3 text-[0.7rem] text-neutral-500">
                        If every item on this job is approved, the job will automatically move to{" "}
                        <span className="text-neutral-300">Queued</span>.
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          {!loading && !error ? (
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-4">
              <div className="text-xs text-neutral-400">
                If approvals never appear, confirm the portal user is linked by{" "}
                <span className="font-mono text-neutral-200">customers.user_id = auth.uid()</span>.
              </div>
            </div>
          ) : null}

          {/* headers currently unused, but kept in state if you want to display request status/notes */}
          {headers.length > 0 ? null : null}
        </div>
      </div>
    </div>
  );
}
