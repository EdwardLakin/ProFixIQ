"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type RecommendationRow = {
  id: string;
  domain: "work_orders" | "shop_boost";
  subjectType: string;
  subjectId: string | null;
  title: string;
  summary: string | null;
  status: "open" | "acknowledged" | "resolved" | "dismissed" | "expired" | "superseded";
  priority: "low" | "normal" | "high" | "urgent";
  riskTier: "low" | "medium" | "high" | "critical";
  confidence: number | null;
  missingDataCount: number;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  source: string;
  recommendationType: string;
  recommendedActionType: string | null;
  targetLabel: string;
  targetHref: string | null;
  hasPreview: boolean;
  previewStatus: string | null;
  pendingApprovalCount: number;
  requiresApproval: boolean;
};

type Summary = {
  total: number;
  open: number;
  acknowledged: number;
  urgent: number;
  high: number;
  missingData: number;
  pendingApprovals: number;
  previewsReady: number;
};

type ApiResponse = {
  items: RecommendationRow[];
  summary: Summary;
  nextCursor: string | null;
};

type BulkAction = "dismiss" | "resolve";
type BulkDomain = "work_orders" | "shop_boost";

const DEFAULT_SUMMARY: Summary = {
  total: 0,
  open: 0,
  acknowledged: 0,
  urgent: 0,
  high: 0,
  missingData: 0,
  pendingApprovals: 0,
  previewsReady: 0,
};

const BULK_CONFIRMATION_TOKENS: Record<BulkAction, Record<BulkDomain, string>> = {
  dismiss: {
    work_orders: "DISMISS_WORK_ORDERS_RECOMMENDATIONS",
    shop_boost: "DISMISS_SHOP_BOOST_RECOMMENDATIONS",
  },
  resolve: {
    work_orders: "RESOLVE_WORK_ORDERS_RECOMMENDATIONS",
    shop_boost: "RESOLVE_SHOP_BOOST_RECOMMENDATIONS",
  },
};

export default function AiRecommendationsReviewClient() {
  const [items, setItems] = useState<RecommendationRow[]>([]);
  const [summary, setSummary] = useState<Summary>(DEFAULT_SUMMARY);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [domain, setDomain] = useState("all");
  const [status, setStatus] = useState("all");
  const [risk, setRisk] = useState("all");
  const [missingData, setMissingData] = useState("all");
  const [hasPreview, setHasPreview] = useState("all");
  const [requiresApproval, setRequiresApproval] = useState("all");
  const [search, setSearch] = useState("");
  const [recommendationType, setRecommendationType] = useState("");
  const [subjectType, setSubjectType] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [bulkAction, setBulkAction] = useState<BulkAction>("dismiss");
  const [confirm, setConfirm] = useState("");
  const [bulkWorking, setBulkWorking] = useState(false);

  const queryString = useMemo(() => {
    const params = new URLSearchParams({
      domain,
      status,
      risk,
      missingData,
      hasPreview,
      requiresApproval,
      limit: "25",
    });

    const trimmed = search.trim();
    if (trimmed) params.set("search", trimmed);

    return params.toString();
  }, [domain, status, risk, missingData, hasPreview, requiresApproval, search]);

  const load = useCallback(async (nextCursor?: string | null) => {
    setLoading(true);
    setError(null);

    try {
      const suffix = nextCursor ? `&cursor=${encodeURIComponent(nextCursor)}` : "";
      const res = await fetch(`/api/dashboard/ai-recommendations?${queryString}${suffix}`, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as Partial<ApiResponse> & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to load recommendations.");

      setItems(Array.isArray(json.items) ? json.items : []);
      setSummary(json.summary ?? DEFAULT_SUMMARY);
      setCursor(json.nextCursor ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load recommendations.");
      setItems([]);
      setSummary(DEFAULT_SUMMARY);
      setCursor(null);
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    void load(null);
  }, [load]);

  const bulkDomain = domain === "work_orders" || domain === "shop_boost" ? (domain as BulkDomain) : null;
  const safeScopedFilters = useMemo(() => {
    return (
      status !== "all"
      || risk !== "all"
      || recommendationType.trim().length > 0
      || subjectType.trim().length > 0
      || subjectId.trim().length > 0
      || search.trim().length > 0
      || missingData !== "all"
      || hasPreview !== "all"
      || requiresApproval !== "all"
    );
  }, [status, risk, recommendationType, subjectType, subjectId, search, missingData, hasPreview, requiresApproval]);

  const bulkEnabled = bulkDomain !== null && safeScopedFilters;
  const requiredConfirm = bulkDomain ? BULK_CONFIRMATION_TOKENS[bulkAction][bulkDomain] : "";

  const handleBulkAction = useCallback(async () => {
    if (!bulkDomain) return;
    if (!bulkEnabled) {
      toast.error("Add filters to scope bulk review before running this action.");
      return;
    }
    if (confirm.trim() !== requiredConfirm) {
      toast.error("Confirmation text does not match required token.");
      return;
    }

    setBulkWorking(true);
    setError(null);

    try {
      const response = await fetch("/api/ai/recommendations/bulk-lifecycle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: bulkAction,
          domain: bulkDomain,
          confirm: confirm.trim(),
          limit: 100,
          filters: {
            status: status === "all" ? undefined : status,
            risk: risk === "all" ? undefined : risk,
            recommendationType: recommendationType.trim() || undefined,
            subjectType: subjectType.trim() || undefined,
            subjectId: subjectId.trim() || undefined,
          },
        }),
      });

      const json = (await response.json().catch(() => ({}))) as {
        error?: string;
        matchedCount?: number;
        updatedCount?: number;
        skippedCount?: number;
        executionBlocked?: boolean;
      };
      if (!response.ok) throw new Error(json.error ?? "Bulk lifecycle update failed.");

      toast.success(`Bulk ${bulkAction} complete: ${json.updatedCount ?? 0} updated, ${json.skippedCount ?? 0} skipped.`);
      if (json.executionBlocked !== true) {
        toast.warning("Execution is expected to remain blocked. Please verify policy settings.");
      }
      setConfirm("");
      await load(null);
    } catch (bulkError) {
      const message = bulkError instanceof Error ? bulkError.message : "Bulk lifecycle update failed.";
      setError(message);
      toast.error(message);
    } finally {
      setBulkWorking(false);
    }
  }, [bulkDomain, bulkEnabled, confirm, requiredConfirm, bulkAction, status, risk, recommendationType, subjectType, subjectId, load]);

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard label="Open" value={summary.open} />
        <SummaryCard label="Urgent / High" value={summary.urgent + summary.high} />
        <SummaryCard label="Missing data" value={summary.missingData} />
        <SummaryCard label="Pending approvals" value={summary.pendingApprovals} />
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
          <SelectFilter label="Domain" value={domain} onChange={setDomain} options={["all", "work_orders", "shop_boost"]} />
          <SelectFilter label="Status" value={status} onChange={setStatus} options={["all", "open", "acknowledged", "resolved", "dismissed", "expired"]} />
          <SelectFilter label="Risk/Priority" value={risk} onChange={setRisk} options={["all", "urgent", "high", "medium", "low"]} />
          <SelectFilter label="Missing data" value={missingData} onChange={setMissingData} options={["all", "true", "false"]} />
          <SelectFilter label="Has preview" value={hasPreview} onChange={setHasPreview} options={["all", "true", "false"]} />
          <SelectFilter label="Requires approval" value={requiresApproval} onChange={setRequiresApproval} options={["all", "true", "false"]} />
          <label className="flex flex-col gap-1 text-xs text-neutral-300">
            Recommendation type
            <input
              value={recommendationType}
              onChange={(event) => setRecommendationType(event.target.value)}
              placeholder="e.g. closeout_risk"
              className="rounded-lg border border-white/15 bg-black/35 px-2.5 py-2 text-sm text-white outline-none ring-0 placeholder:text-neutral-500"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-neutral-300">
            Subject type
            <input
              value={subjectType}
              onChange={(event) => setSubjectType(event.target.value)}
              placeholder="e.g. work_order"
              className="rounded-lg border border-white/15 bg-black/35 px-2.5 py-2 text-sm text-white outline-none ring-0 placeholder:text-neutral-500"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-neutral-300">
            Subject id
            <input
              value={subjectId}
              onChange={(event) => setSubjectId(event.target.value)}
              placeholder="WO-123"
              className="rounded-lg border border-white/15 bg-black/35 px-2.5 py-2 text-sm text-white outline-none ring-0 placeholder:text-neutral-500"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-neutral-300 md:col-span-2">
            Search
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search title or summary"
              className="rounded-lg border border-white/15 bg-black/35 px-2.5 py-2 text-sm text-white outline-none ring-0 placeholder:text-neutral-500"
            />
          </label>
        </div>

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => void load(null)}
            className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20"
          >
            Refresh
          </button>
        </div>
      </div>

      {bulkDomain ? (
        <div className="rounded-2xl border border-amber-400/25 bg-amber-500/5 p-4">
          <h3 className="text-sm font-semibold text-amber-100">Bulk review actions</h3>
          <p className="mt-1 text-xs text-amber-200/90">
            This will {bulkAction} up to 100 open/acknowledged {bulkDomain === "work_orders" ? "work-order" : "Shop Boost"} AI recommendations matching the current filters.
          </p>
          <p className="mt-1 text-xs text-neutral-300">No execution / no business records changed. This updates recommendation lifecycle state only.</p>
          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
            <SelectFilter label="Bulk action" value={bulkAction} onChange={(value) => setBulkAction(value as BulkAction)} options={["dismiss", "resolve"]} />
            <label className="flex flex-col gap-1 text-xs text-neutral-300 md:col-span-2">
              Type confirmation token to enable
              <input
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                placeholder={requiredConfirm}
                className="rounded-lg border border-white/15 bg-black/35 px-2.5 py-2 text-sm text-white outline-none ring-0 placeholder:text-neutral-500"
              />
            </label>
          </div>
          {!safeScopedFilters ? (
            <p className="mt-2 text-xs text-amber-200">Add one or more filters (status/risk/type/subject/search/flags) to safely scope this bulk action.</p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!bulkEnabled || confirm.trim() !== requiredConfirm || bulkWorking}
              onClick={() => void handleBulkAction()}
              className="rounded-full border border-amber-300/45 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-500/20 disabled:opacity-50"
            >
              {bulkWorking ? "Applying…" : `Confirm ${bulkAction}`}
            </button>
            <span className="text-xs text-neutral-400">Required token: {requiredConfirm}</span>
          </div>
        </div>
      ) : null}

      {loading ? <p className="text-sm text-neutral-400">Loading AI recommendations…</p> : null}
      {error ? <p className="rounded-xl border border-red-400/30 bg-red-950/20 p-3 text-sm text-red-200">{error}</p> : null}

      {!loading && !error && items.length === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm text-neutral-300">
          No recommendations matched your filters.
        </p>
      ) : null}

      <div className="space-y-3">
        {items.map((item) => (
          <article key={item.id} className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase">
              <span className="rounded-full border border-cyan-400/35 px-2 py-0.5 text-cyan-200">
                {item.domain === "shop_boost" ? "Shop Boost" : "Work order"}
              </span>
              <span className="rounded-full border border-white/20 px-2 py-0.5 text-neutral-200">{item.status}</span>
              <span className="rounded-full border border-white/20 px-2 py-0.5 text-neutral-200">{item.priority}</span>
              <span className="rounded-full border border-white/20 px-2 py-0.5 text-neutral-200">{item.riskTier}</span>
            </div>

            <h2 className="mt-2 text-base font-semibold text-white">{item.title}</h2>
            <p className="mt-1 text-sm text-neutral-300">{item.summary ?? "No summary provided."}</p>

            <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-neutral-400 md:grid-cols-4">
              <span>Confidence: {item.confidence == null ? "—" : `${Math.round(item.confidence * 100)}%`}</span>
              <span>Missing data: {item.missingDataCount}</span>
              <span>Pending approvals: {item.pendingApprovalCount}</span>
              <span>Source: {item.source}</span>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
              <span className="text-neutral-400">Updated: {new Date(item.updatedAt).toLocaleString()}</span>
              <span className="text-neutral-400">Type: {item.recommendationType}</span>
              <span className="text-neutral-400">Action: {item.recommendedActionType ?? "review_only"}</span>
              {item.previewStatus ? <span className="text-neutral-400">Preview: {item.previewStatus}</span> : null}
              {item.targetHref ? (
                <Link href={item.targetHref} className="text-[var(--brand-primary)] hover:opacity-80">
                  View target →
                </Link>
              ) : null}
            </div>
          </article>
        ))}
      </div>

      {!loading && cursor ? (
        <button
          type="button"
          onClick={() => void load(cursor)}
          className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20"
        >
          Next page
        </button>
      ) : null}
    </section>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-3">
      <p className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-white">{value}</p>
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
    <label className="flex flex-col gap-1 text-xs text-neutral-300">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-lg border border-white/15 bg-black/35 px-2.5 py-2 text-sm text-white"
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
