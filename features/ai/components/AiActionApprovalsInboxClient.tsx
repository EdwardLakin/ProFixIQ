"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type AiApprovalInboxStatus = "pending" | "approved" | "rejected" | "expired";

type AiApprovalInboxRow = {
  id: string;
  status: AiApprovalInboxStatus;
  domain: string;
  subjectType: string | null;
  subjectId: string | null;
  subjectHref: string | null;
  title: string;
  description: string;
  riskLevel: string | null;
  approvalRequired: boolean;
  ownerPinRequired: boolean;
  ownerPinProofAttached: boolean;
  requestedAt: string | null;
  requestedByLabel: string | null;
  decidedAt: string | null;
  decidedByLabel: string | null;
  previewId: string | null;
  recommendationId: string | null;
  previewStatus: string | null;
  recommendationStatus: string | null;
  executionBlocked: true;
};

type Summary = {
  pending: number;
  approved: number;
  rejected: number;
  expired: number;
  ownerPinRequired: number;
  highRisk: number;
};

type ApiResult = {
  rows: AiApprovalInboxRow[];
  summary: Summary;
  nextCursor: string | null;
};

const EMPTY_SUMMARY: Summary = {
  pending: 0,
  approved: 0,
  rejected: 0,
  expired: 0,
  ownerPinRequired: 0,
  highRisk: 0,
};

export default function AiActionApprovalsInboxClient() {
  const [rows, setRows] = useState<AiApprovalInboxRow[]>([]);
  const [summary, setSummary] = useState<Summary>(EMPTY_SUMMARY);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const [status, setStatus] = useState<"pending" | "approved" | "rejected" | "expired" | "all">("pending");
  const [domain, setDomain] = useState<"all" | "work_orders" | "shop_boost">("all");
  const [risk, setRisk] = useState<"all" | "low" | "medium" | "high" | "critical">("all");
  const [search, setSearch] = useState("");

  const queryString = useMemo(() => {
    const params = new URLSearchParams({
      status,
      domain,
      risk,
      limit: "25",
    });

    const trimmed = search.trim();
    if (trimmed) params.set("search", trimmed);

    return params.toString();
  }, [status, domain, risk, search]);

  const load = useCallback(async (cursor?: string | null) => {
    setLoading(true);
    setError(null);

    try {
      const suffix = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
      const response = await fetch(`/api/ai/action-approvals?${queryString}${suffix}`, { cache: "no-store" });
      const json = (await response.json().catch(() => ({}))) as Partial<ApiResult> & { error?: string };
      if (!response.ok) throw new Error(json.error ?? "Failed to load AI approvals.");

      setRows(Array.isArray(json.rows) ? json.rows : []);
      setSummary(json.summary ?? EMPTY_SUMMARY);
      setNextCursor(json.nextCursor ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load AI approvals.");
      setRows([]);
      setSummary(EMPTY_SUMMARY);
      setNextCursor(null);
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    void load(null);
  }, [load]);

  const decide = useCallback(async (approvalId: string, decision: "approved" | "rejected") => {
    setActingId(approvalId);
    setError(null);

    try {
      const response = await fetch(`/api/ai/action-approvals/${approvalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });

      const json = (await response.json().catch(() => ({}))) as { error?: string; executionBlocked?: boolean; message?: string };
      if (!response.ok) throw new Error(json.error ?? `Failed to ${decision} approval.`);

      toast.success(json.message ?? "Approval decision recorded.");
      if (json.executionBlocked !== true) {
        toast.warning("Execution remains blocked by policy.");
      }
      await load(null);
    } catch (decisionError) {
      const message = decisionError instanceof Error ? decisionError.message : `Failed to ${decision} approval.`;
      setError(message);
      toast.error(message);
    } finally {
      setActingId(null);
    }
  }, [load]);

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard label="Pending" value={summary.pending} />
        <SummaryCard label="High risk" value={summary.highRisk} />
        <SummaryCard label="Owner PIN required" value={summary.ownerPinRequired} />
        <SummaryCard label="Recently decided" value={summary.approved + summary.rejected + summary.expired} />
      </div>

      <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
          <SelectFilter label="Status" value={status} onChange={(value) => setStatus(value as never)} options={["pending", "approved", "rejected", "expired", "all"]} />
          <SelectFilter label="Domain" value={domain} onChange={(value) => setDomain(value as never)} options={["all", "work_orders", "shop_boost"]} />
          <SelectFilter label="Risk" value={risk} onChange={(value) => setRisk(value as never)} options={["all", "critical", "high", "medium", "low"]} />
          <label className="flex flex-col gap-1 text-xs text-[color:var(--theme-text-secondary)] md:col-span-2">
            Search
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search approval title or subject"
              className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2.5 py-2 text-sm text-[color:var(--theme-text-primary)] outline-none ring-0 placeholder:text-[color:var(--theme-text-muted)]"
            />
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[color:var(--theme-text-secondary)]">
          <button
            type="button"
            onClick={() => void load(null)}
            className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3 py-1.5 text-xs font-semibold text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-subtle)]"
          >
            Refresh
          </button>
          <span>Approving records review approval only. It does not execute the action.</span>
        </div>
      </div>

      {loading ? <p className="text-sm text-[color:var(--theme-text-secondary)]">Loading approval inbox…</p> : null}
      {error ? <p className="rounded-xl border border-red-400/30 bg-red-950/20 p-3 text-sm text-red-200">{error}</p> : null}

      {!loading && !error && rows.length === 0 ? (
        <p className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 text-sm text-[color:var(--theme-text-secondary)]">
          No approval requests matched your filters.
        </p>
      ) : null}

      <div className="space-y-3">
        {rows.map((row) => (
          <article key={row.id} className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4">
            <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase">
              <span className="rounded-full border border-[color:var(--theme-border-soft)] px-2 py-0.5 text-[color:var(--theme-text-primary)]">{row.status}</span>
              <span className="rounded-full border border-[color:var(--theme-border-soft)] px-2 py-0.5 text-[color:var(--theme-text-primary)]">{row.riskLevel ?? "unknown"} risk</span>
              <span className="rounded-full border border-cyan-400/35 px-2 py-0.5 text-cyan-200">{row.domain === "shop_boost" ? "Shop Boost" : "Work order"}</span>
              {row.ownerPinRequired ? (
                <span className="rounded-full border border-amber-400/40 px-2 py-0.5 text-amber-200">
                  Owner PIN {row.ownerPinProofAttached ? "proof attached" : "required"}
                </span>
              ) : null}
            </div>

            <h2 className="mt-2 text-base font-semibold text-[color:var(--theme-text-primary)]">{row.title}</h2>
            <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">{row.description}</p>

            <div className="mt-2 grid grid-cols-1 gap-2 text-xs text-[color:var(--theme-text-secondary)] md:grid-cols-2 xl:grid-cols-4">
              <span>Requested: {row.requestedAt ? new Date(row.requestedAt).toLocaleString() : "—"}</span>
              <span>Requested by: {row.requestedByLabel ?? "—"}</span>
              <span>Decided: {row.decidedAt ? new Date(row.decidedAt).toLocaleString() : "—"}</span>
              <span>Decided by: {row.decidedByLabel ?? "—"}</span>
              <span>Preview status: {row.previewStatus ?? "—"}</span>
              <span>Recommendation status: {row.recommendationStatus ?? "—"}</span>
              <span>Execution blocked: {row.executionBlocked ? "yes" : "no"}</span>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
              {row.subjectHref ? (
                <Link href={row.subjectHref} className="text-[var(--brand-primary)] hover:opacity-80">
                  {row.domain === "shop_boost" ? "View source" : "Open work order"} →
                </Link>
              ) : null}
              {row.recommendationId ? (
                <Link href="/dashboard/ai-recommendations" className="text-[var(--brand-primary)] hover:opacity-80">
                  View recommendation queue →
                </Link>
              ) : null}
            </div>

            {row.status === "pending" ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={actingId === row.id}
                  onClick={() => void decide(row.id, "approved")}
                  className="rounded-full border border-emerald-400/35 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-50"
                >
                  Approve request
                </button>
                <button
                  type="button"
                  disabled={actingId === row.id}
                  onClick={() => void decide(row.id, "rejected")}
                  className="rounded-full border border-red-400/35 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-100 hover:bg-red-500/20 disabled:opacity-50"
                >
                  Reject request
                </button>
              </div>
            ) : null}
          </article>
        ))}
      </div>

      {!loading && nextCursor ? (
        <button
          type="button"
          onClick={() => void load(nextCursor)}
          className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3 py-1.5 text-xs font-semibold text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-subtle)]"
        >
          Next page
        </button>
      ) : null}
    </section>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">
      <p className="text-[10px] uppercase tracking-[0.15em] text-[color:var(--theme-text-muted)]">{label}</p>
      <p className="mt-1 text-xl font-semibold text-[color:var(--theme-text-primary)]">{value}</p>
    </div>
  );
}

function SelectFilter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-[color:var(--theme-text-secondary)]">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2.5 py-2 text-sm text-[color:var(--theme-text-primary)]"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
