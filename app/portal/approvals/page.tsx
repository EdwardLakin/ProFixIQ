// app/portal/approvals/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

type ApprovalItem = {
  id: string;
  description: string | null;
  qty: number | null;
  vendor: string | null;
  quoted_price: number | null;
  markup_pct: number | null;
  approved: boolean | null;
};

type ApprovalRow = {
  line_id: string;
  work_order_id: string;
  description: string | null;
  complaint: string | null;
  notes: string | null;
  status: string | null;
  approval_state: string | null;
  hold_reason: string | null;
  created_at: string | null;
  items: ApprovalItem[];
};

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

const COPPER = "#C57A4A";

function fmtMoney(n: number | null | undefined) {
  if (typeof n !== "number" || Number.isNaN(n)) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "CAD",
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  try {
    return d.toLocaleString();
  } catch {
    return d.toISOString();
  }
}

function statusLabel(s: string | null | undefined) {
  return (s ?? "pending").replaceAll("_", " ");
}

function badgeTone(kind: "pending" | "approved" | "mixed") {
  if (kind === "approved") {
    return "border-emerald-400/40 bg-emerald-400/10 text-emerald-100";
  }
  if (kind === "mixed") {
    return "border-amber-400/40 bg-amber-400/10 text-amber-100";
  }
  return "border-sky-400/40 bg-sky-400/10 text-sky-100";
}

export default function PortalApprovalsPage() {
  const router = useRouter();

  const [rows, setRows] = useState<ApprovalRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);

  const fetchApprovals = async (opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent;
    if (!silent) setLoading(true);
    else setRefreshing(true);

    setError(null);
    try {
      const res = await fetch("/api/portal/approvals", { method: "GET" });
      const raw = await res.text();
      const json = raw ? (JSON.parse(raw) as any) : null;

      if (!res.ok) {
        const msg =
          json?.error ||
          raw ||
          `Failed to load approvals (status ${res.status})`;
        setError(msg);
        setRows([]);
        return;
      }

      const data = (json?.rows ?? []) as ApprovalRow[];
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load approvals");
      setRows([]);
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
    rows.forEach((r) => (n += (r.items ?? []).length));
    return n;
  }, [rows]);

  const approveItem = async (itemId: string) => {
    if (!itemId || busyItemId) return;
    setBusyItemId(itemId);
    try {
      const res = await fetch("/api/portal/approvals/item/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId }),
      });

      const raw = await res.text();
      const json = raw ? (JSON.parse(raw) as any) : null;

      if (!res.ok) {
        const msg = json?.error || raw || `Approve failed (${res.status})`;
        toast.error(msg);
        return;
      }

      toast.success("Approved");
      await fetchApprovals({ silent: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setBusyItemId(null);
    }
  };

  const declineItem = async (itemId: string) => {
    if (!itemId || busyItemId) return;
    setBusyItemId(itemId);
    try {
      const res = await fetch("/api/portal/approvals/item/decline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId }),
      });

      const raw = await res.text();
      const json = raw ? (JSON.parse(raw) as any) : null;

      if (!res.ok) {
        const msg = json?.error || raw || `Decline failed (${res.status})`;
        toast.error(msg);
        return;
      }

      toast.success("Declined");
      await fetchApprovals({ silent: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Decline failed");
    } finally {
      setBusyItemId(null);
    }
  };

  const lineSummary = (r: ApprovalRow) => {
    const items = r.items ?? [];
    if (items.length === 0) return { kind: "pending" as const, text: "No items" };

    const approvedCount = items.filter((it) => !!it.approved).length;
    if (approvedCount === 0) {
      return {
        kind: "pending" as const,
        text: "Awaiting your approval",
      };
    }
    if (approvedCount === items.length) {
      return {
        kind: "approved" as const,
        text: "All items approved",
      };
    }
    return {
      kind: "mixed" as const,
      text: `${approvedCount}/${items.length} approved`,
    };
  };

  const shell =
    "rounded-3xl border border-white/10 bg-black/25 p-4 backdrop-blur-md shadow-card sm:p-6";
  const glass =
    "rounded-2xl border border-white/10 bg-black/25 backdrop-blur-md shadow-card";
  const metalHeader =
    "rounded-2xl border border-white/10 bg-gradient-to-r from-slate-900/70 via-black/40 to-black/60 px-4 py-3";

  return (
    <div className="min-h-dvh app-metal-bg text-white">
      <div className="mx-auto w-full max-w-5xl px-3 py-4 md:px-6">
        <div className={shell}>
          {/* Top header */}
          <div className={cx(metalHeader, "flex items-start justify-between gap-3")}>
            <div className="min-w-0">
              <div
                className="font-blackops text-[0.9rem] tracking-[0.18em]"
                style={{ color: COPPER }}
              >
                APPROVALS
              </div>
              <div className="mt-1 text-xs text-neutral-300">
                Review and approve parts for jobs awaiting your confirmation.
              </div>
              <div className="mt-2 text-[0.7rem] text-neutral-400">
                When all items on a job are approved, the job automatically moves
                forward.
              </div>
            </div>

            <div className="flex shrink-0 flex-col items-end gap-2">
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-white/12 bg-black/40 px-3 py-1 text-[0.7rem] text-neutral-200">
                  {rows.length} jobs
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

          {/* Error */}
          {error && (
            <div className="mt-4 rounded-2xl border border-red-400/40 bg-red-500/10 p-4">
              <div className="text-sm font-semibold text-red-100">Error</div>
              <div className="mt-1 whitespace-pre-wrap text-xs text-red-200">
                {error}
              </div>
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
          )}

          {/* Loading */}
          {loading && !error ? (
            <div className="mt-4 grid gap-3">
              <div className="h-24 rounded-2xl border border-white/10 bg-black/25 animate-pulse" />
              <div className="h-24 rounded-2xl border border-white/10 bg-black/25 animate-pulse" />
              <div className="h-24 rounded-2xl border border-white/10 bg-black/25 animate-pulse" />
            </div>
          ) : null}

          {/* Empty */}
          {!loading && !error && rows.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-6 text-center">
              <div className="text-sm font-semibold text-neutral-100">
                Nothing to approve
              </div>
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

          {/* Rows */}
          {!loading && !error && rows.length > 0 ? (
            <div className="mt-4 space-y-3">
              {rows.map((r) => {
                const title = (r.description ?? r.complaint ?? "Job").trim();
                const summary = lineSummary(r);

                const items = Array.isArray(r.items) ? r.items : [];
                const created = fmtDate(r.created_at);

                return (
                  <div key={r.line_id} className={glass}>
                    {/* Line header */}
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 px-4 py-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="truncate text-sm font-semibold text-neutral-100">
                            {title}
                          </div>
                          <span
                            className={cx(
                              "inline-flex items-center rounded-full border px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.14em]",
                              badgeTone(summary.kind),
                            )}
                          >
                            {summary.text}
                          </span>
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[0.7rem] text-neutral-400">
                          <span className="rounded-full border border-white/10 bg-black/35 px-2 py-0.5">
                            Status: {statusLabel(r.status)}
                          </span>
                          <span className="rounded-full border border-white/10 bg-black/35 px-2 py-0.5">
                            Approval: {statusLabel(r.approval_state)}
                          </span>
                          {r.hold_reason ? (
                            <span className="rounded-full border border-white/10 bg-black/35 px-2 py-0.5">
                              Hold: {r.hold_reason}
                            </span>
                          ) : null}
                          <span className="rounded-full border border-white/10 bg-black/35 px-2 py-0.5">
                            Created: {created}
                          </span>
                        </div>

                        {r.notes ? (
                          <div className="mt-2 rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-xs text-neutral-200">
                            <span
                              className="mr-2 font-semibold uppercase tracking-[0.16em]"
                              style={{ color: COPPER }}
                            >
                              Note
                            </span>
                            <span className="text-neutral-200">{r.notes}</span>
                          </div>
                        ) : null}
                      </div>

                      <div className="shrink-0 text-right">
                        <div className="text-[0.65rem] text-neutral-400 uppercase tracking-[0.18em]">
                          Work order
                        </div>
                        <div className="mt-1 rounded-full border border-white/12 bg-black/40 px-3 py-1 font-mono text-[0.7rem] text-neutral-100">
                          {r.work_order_id}
                        </div>
                        <div className="mt-2 text-[0.65rem] text-neutral-500">
                          Line:{" "}
                          <span className="font-mono text-neutral-300">
                            {r.line_id}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Items list */}
                    <div className="px-4 py-4">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="text-[0.75rem] font-semibold uppercase tracking-[0.18em] text-neutral-300">
                          Parts
                        </div>
                        <div className="text-[0.7rem] text-neutral-500">
                          Approve each item to move the job forward.
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
                              const approved = !!it.approved;
                              const isBusy = busyItemId === it.id;

                              return (
                                <div
                                  key={it.id}
                                  className="grid grid-cols-12 gap-2 px-3 py-3"
                                >
                                  <div className="col-span-6 min-w-0">
                                    <div className="truncate text-sm text-neutral-100">
                                      {it.description ?? "—"}
                                    </div>
                                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[0.7rem] text-neutral-400">
                                      <span className="rounded-full border border-white/10 bg-black/40 px-2 py-0.5">
                                        Markup:{" "}
                                        {typeof it.markup_pct === "number"
                                          ? `${it.markup_pct}%`
                                          : "—"}
                                      </span>
                                      <span
                                        className={cx(
                                          "rounded-full border px-2 py-0.5",
                                          approved
                                            ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-100"
                                            : "border-white/10 bg-black/40 text-neutral-300",
                                        )}
                                      >
                                        {approved ? "Approved" : "Not approved"}
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
                                        onClick={() => void approveItem(it.id)}
                                        disabled={isBusy}
                                        className="inline-flex items-center rounded-full border border-white/12 bg-black/45 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-neutral-100 transition hover:bg-black/70 active:scale-95 disabled:opacity-60"
                                        title="Approve item"
                                      >
                                        <span style={{ color: COPPER }}>
                                          {isBusy ? "..." : "Approve"}
                                        </span>
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => void declineItem(it.id)}
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
                        If every item on this job is approved, the job will
                        automatically move to{" "}
                        <span className="text-neutral-300">Queued</span>.
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          {/* Bottom hint */}
          {!loading && !error ? (
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-4">
              <div className="text-xs text-neutral-400">
                Trouble seeing approvals? Make sure your portal user is linked to
                your customer record via{" "}
                <span className="font-mono text-neutral-200">
                  customers.user_id = auth.uid()
                </span>
                .
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}