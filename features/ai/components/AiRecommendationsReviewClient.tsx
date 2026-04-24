"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

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
