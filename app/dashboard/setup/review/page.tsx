"use client";

import { useEffect, useMemo, useState } from "react";

type ReviewItem = {
  id: string;
  domain: string;
  issue_type: string;
  summary: string;
  raw_payload: Record<string, unknown>;
  normalized_payload: Record<string, unknown>;
  target_domain: string | null;
  blocking_reason: string | null;
  dependency_refs: Record<string, unknown> | null;
  downstream_impact_count: number | null;
  cluster_key: string | null;
  cluster_confidence: number | null;
  suggested_matches: unknown;
  status: "pending" | "resolved" | "materialized" | "failed_materialization" | "ignored";
  resolution_action: "linked_to_existing" | "created_new" | "ignored" | null;
  ignore_reason_code: string | null;
  ignore_note: string | null;
  ignored_at: string | null;
  resolved_at: string | null;
  materialized_at: string | null;
  materialization_error: string | null;
  materialized_record: Record<string, unknown> | null;
  created_at: string;
};

const domains = ["", "customer", "vehicle", "part", "work_order", "invoice", "history"];

export default function ShopBoostReviewPage() {
  const [domain, setDomain] = useState("");
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [ignoreReason, setIgnoreReason] = useState("duplicate");
  const [ignoreNote, setIgnoreNote] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (domain) params.set("domain", domain);
    if (statusFilter) params.set("status", statusFilter);
    const res = await fetch(`/api/shop-boost/review-items?${params.toString()}`, { cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; items?: ReviewItem[] };
    setItems(json.ok ? json.items ?? [] : []);
    setSelectedIds([]);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [domain, statusFilter]);

  const grouped = useMemo(() => {
    return items.reduce<Record<string, number>>((acc, item) => {
      acc[item.domain] = (acc[item.domain] ?? 0) + 1;
      return acc;
    }, {});
  }, [items]);

  const resolve = async (id: string, resolution_action: "linked_to_existing" | "created_new" | "ignored") => {
    const res = await fetch(`/api/shop-boost/review-items/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolution_action }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    setFeedback(json.ok ? "Resolved + Applied" : `Materialization failed: ${json.error ?? "unknown error"}`);
    await load();
  };

  const resolveBulk = async (resolution_action: "linked_to_existing" | "created_new" | "ignored") => {
    if (selectedIds.length === 0) return;
    const res = await fetch("/api/shop-boost/review-items/resolve-bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ review_item_ids: selectedIds, resolution_action }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; results?: Array<{ ok: boolean }> };
    const okCount = (json.results ?? []).filter((item) => item.ok).length;
    setFeedback(json.ok ? `Resolved + Applied (${okCount}/${selectedIds.length})` : `Bulk materialization completed with failures (${okCount}/${selectedIds.length}).`);
    await load();
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]));
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <h1 className="text-xl font-semibold text-white">Shop Boost Data Review</h1>
        <p className="mt-1 text-sm text-neutral-300">Resolve review items and immediately apply results into customers, vehicles, work orders, invoices, and parts.</p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-neutral-300">
          {Object.entries(grouped).map(([key, count]) => (
            <span key={key} className="rounded-full border border-white/15 px-2 py-1">{key}: {count}</span>
          ))}
        </div>
        {feedback ? (
          <div className="mt-3 rounded-lg border border-emerald-400/30 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-100">{feedback}</div>
        ) : null}
      </div>

      <div className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-3">
        <div>
          <label className="text-xs uppercase tracking-[0.16em] text-neutral-400">Filter by domain</label>
          <select
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            className="mt-2 w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"
          >
            {domains.map((d) => (
              <option key={d || "all"} value={d}>
                {d || "all domains"}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs uppercase tracking-[0.16em] text-neutral-400">Filter by status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="mt-2 w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"
          >
            <option value="pending">pending</option>
            <option value="failed_materialization">failed materialization</option>
            <option value="materialized">materialized</option>
            <option value="ignored">ignored</option>
          </select>
        </div>

        <div>
          <label className="text-xs uppercase tracking-[0.16em] text-neutral-400">Ignore reason</label>
          <select value={ignoreReason} onChange={(e) => setIgnoreReason(e.target.value)} className="mt-2 w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 text-sm text-white">
            {["duplicate", "obsolete", "invalid", "test_data", "intentionally_skipped", "unsupported_format", "other"].map((reason) => (
              <option key={reason} value={reason}>{reason}</option>
            ))}
          </select>
          <input value={ignoreNote} onChange={(e) => setIgnoreNote(e.target.value)} placeholder="Optional ignore note" className="mt-2 w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 text-sm text-white" />
        </div>

        {selectedIds.length > 0 ? (
          <div className="flex flex-wrap gap-2 text-xs">
            <button className="rounded border border-sky-300/40 px-2 py-1 text-sky-100" onClick={() => void resolveBulk("linked_to_existing")}>Bulk link to existing</button>
            <button className="rounded border border-emerald-300/40 px-2 py-1 text-emerald-100" onClick={() => void resolveBulk("created_new")}>Bulk create new</button>
            <button className="rounded border border-white/25 px-2 py-1 text-neutral-200" onClick={async () => {
              if (selectedIds.length === 0) return;
              const res = await fetch("/api/shop-boost/review-items/resolve-bulk", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ review_item_ids: selectedIds, resolution_action: "ignored", ignore_reason_code: ignoreReason, ignore_note: ignoreNote || null }),
              });
              const json = (await res.json().catch(() => ({}))) as { ok?: boolean; results?: Array<{ ok: boolean }> };
              const okCount = (json.results ?? []).filter((item) => item.ok).length;
              setFeedback(json.ok ? `Ignored (${okCount}/${selectedIds.length})` : `Bulk ignore completed with failures (${okCount}/${selectedIds.length}).`);
              await load();
            }}>Bulk ignore</button>
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="text-sm text-neutral-400">Loading review queue…</div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-emerald-300/20 bg-emerald-950/20 p-3 text-sm text-emerald-100">No items for this filter.</div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="rounded-xl border border-white/10 bg-black/25 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-start gap-2">
                  <input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => toggleSelected(item.id)} className="mt-1" />
                  <div>
                    <div className="text-sm font-semibold text-white">{item.summary}</div>
                    <div className="text-xs text-neutral-400">{item.domain} • {item.issue_type} • {item.status}</div>
                    <div className="text-xs text-neutral-500">target: {item.target_domain ?? item.domain} • cluster: {item.cluster_key ?? "n/a"} ({item.cluster_confidence?.toFixed(2) ?? "0.00"})</div>
                    {item.blocking_reason ? <div className="text-xs text-amber-200">blocked: {item.blocking_reason}</div> : null}
                    {(item.downstream_impact_count ?? 0) > 0 ? <div className="text-xs text-sky-200">downstream impact: {item.downstream_impact_count}</div> : null}
                    {item.materialized_record ? (
                      <div className="mt-1 text-xs text-emerald-200">Resolved + Applied → {JSON.stringify(item.materialized_record)}</div>
                    ) : null}
                    {item.status === "ignored" ? (
                      <div className="mt-1 text-xs text-neutral-300">Ignored ({item.ignore_reason_code ?? "other"}) {item.ignore_note ? `• ${item.ignore_note}` : ""}</div>
                    ) : null}
                    {item.materialization_error ? (
                      <div className="mt-1 text-xs text-rose-300">Materialization error: {item.materialization_error}</div>
                    ) : null}
                  </div>
                </div>
                <div className="flex gap-2 text-xs">
                  <button className="rounded border border-sky-300/40 px-2 py-1 text-sky-100" onClick={() => void resolve(item.id, "linked_to_existing")}>Link to existing</button>
                  <button className="rounded border border-emerald-300/40 px-2 py-1 text-emerald-100" onClick={() => void resolve(item.id, "created_new")}>Create new</button>
                  <button className="rounded border border-white/25 px-2 py-1 text-neutral-200" onClick={async () => {
                    const res = await fetch(`/api/shop-boost/review-items/${item.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ resolution_action: "ignored", ignore_reason_code: ignoreReason, ignore_note: ignoreNote || null }),
                    });
                    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
                    setFeedback(json.ok ? "Ignored" : `Ignore failed: ${json.error ?? "unknown error"}`);
                    await load();
                  }}>Ignore</button>
                  {item.status === "failed_materialization" ? (
                    <button className="rounded border border-amber-300/40 px-2 py-1 text-amber-100" onClick={() => void resolve(item.id, item.resolution_action ?? "created_new")}>Retry</button>
                  ) : null}
                </div>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-xs uppercase tracking-[0.14em] text-neutral-500">Raw imported data</div>
                  <pre className="max-h-64 overflow-auto rounded border border-white/10 bg-black/40 p-2 text-xs text-neutral-200">{JSON.stringify(item.raw_payload ?? {}, null, 2)}</pre>
                </div>
                <div>
                  <div className="mb-1 text-xs uppercase tracking-[0.14em] text-neutral-500">Normalized / target payload</div>
                  <pre className="max-h-64 overflow-auto rounded border border-white/10 bg-black/40 p-2 text-xs text-neutral-200">{JSON.stringify(item.normalized_payload ?? {}, null, 2)}</pre>
                </div>
                <div>
                  <div className="mb-1 text-xs uppercase tracking-[0.14em] text-neutral-500">Suggested matches / system data</div>
                  <pre className="max-h-64 overflow-auto rounded border border-white/10 bg-black/40 p-2 text-xs text-neutral-200">{JSON.stringify(item.suggested_matches ?? {}, null, 2)}</pre>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
