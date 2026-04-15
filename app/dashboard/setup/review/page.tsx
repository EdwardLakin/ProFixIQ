"use client";

import { useEffect, useMemo, useState } from "react";

type Recommendation = {
  recommendedAction: "link_existing" | "create_new" | "merge_candidate" | "ignore";
  recommendationReason: string;
  recommendationConfidence: number;
  candidateTargets: Array<{ id: string; label: string; score: number }>;
  confidenceLabel: "HIGH" | "MEDIUM" | "LOW";
  requiresManualReview?: boolean;
  blockedAutoApply?: boolean;
};

type ReviewItem = {
  id: string;
  intake_id: string;
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
  materialization_error: string | null;
  materialized_record: Record<string, unknown> | null;
  created_at: string;
  affected_domains?: string[];
  recommendation: Recommendation;
};

type Guidance = {
  is_operational_ready: boolean;
  operational_blockers_count: number;
  non_blocking_issues_count: number;
  integrity_errors?: string[];
  high_risk_actions_count?: number;
};

const domains = ["", "customer", "vehicle", "part", "work_order", "invoice", "history"];

function actionLabel(action: Recommendation["recommendedAction"]): string {
  if (action === "link_existing") return "Link to existing";
  if (action === "merge_candidate") return "Merge candidate";
  if (action === "ignore") return "Ignore";
  return "Create new";
}

function toResolutionAction(action: Recommendation["recommendedAction"]): "linked_to_existing" | "created_new" | "ignored" {
  if (action === "link_existing" || action === "merge_candidate") return "linked_to_existing";
  if (action === "ignore") return "ignored";
  return "created_new";
}

export default function ShopBoostReviewPage() {
  const [domain, setDomain] = useState("");
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [ignoreReason, setIgnoreReason] = useState("duplicate");
  const [ignoreNote, setIgnoreNote] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [guidance, setGuidance] = useState<Guidance | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [reprocessBusy, setReprocessBusy] = useState<null | "failed" | "unresolved" | "updated_matches">(null);
  const [debugView, setDebugView] = useState(false);
  const [confirmRiskById, setConfirmRiskById] = useState<Record<string, boolean>>({});

  const load = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (domain) params.set("domain", domain);
    if (statusFilter) params.set("status", statusFilter);
    const res = await fetch(`/api/shop-boost/review-items?${params.toString()}`, { cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; items?: ReviewItem[]; guidance?: Guidance };
    setItems(json.ok ? json.items ?? [] : []);
    setGuidance(json.guidance ?? null);
    setSelectedIds([]);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [domain, statusFilter]);

  const grouped = useMemo(
    () =>
      items.reduce<Record<string, number>>((acc, item) => {
        acc[item.domain] = (acc[item.domain] ?? 0) + 1;
        return acc;
      }, {}),
    [items],
  );

  const isHighRiskItem = (item: ReviewItem, action: "linked_to_existing" | "created_new" | "ignored") =>
    action === "linked_to_existing" && item.recommendation.recommendedAction === "merge_candidate";

  const applySuggested = async (item: ReviewItem) => {
    const resolution_action = toResolutionAction(item.recommendation.recommendedAction);
    const highRisk = isHighRiskItem(item, resolution_action);
    if (highRisk && !confirmRiskById[item.id]) {
      setFeedback("High-risk action requires explicit confirmation first.");
      return;
    }

    const res = await fetch(`/api/shop-boost/review-items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resolution_action,
        confirm_high_risk_action: highRisk ? true : undefined,
        ignore_reason_code: resolution_action === "ignored" ? ignoreReason : undefined,
        ignore_note: resolution_action === "ignored" ? ignoreNote || null : undefined,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    setFeedback(json.ok ? "Suggested fix applied." : `Suggested fix failed: ${json.error ?? "unknown error"}`);
    await load();
  };

  const applyAllHighConfidence = async () => {
    const intakeId = items[0]?.intake_id;
    const res = await fetch("/api/shop-boost/review-items/resolve-bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apply_suggested_high_confidence: true, confidence_threshold: 0.85, intake_id: intakeId }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; results?: Array<{ ok: boolean }> };
    const okCount = (json.results ?? []).filter((r) => r.ok).length;
    setFeedback(`Applied high-confidence suggestions (${okCount}/${json.results?.length ?? 0}).`);
    await load();
  };

  const resolveSingle = async (item: ReviewItem, resolution_action: "linked_to_existing" | "created_new" | "ignored") => {
    const highRisk = isHighRiskItem(item, resolution_action);
    if (highRisk && !confirmRiskById[item.id]) {
      setFeedback("High-risk action requires explicit confirmation first.");
      return;
    }
    const res = await fetch(`/api/shop-boost/review-items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resolution_action,
        confirm_high_risk_action: highRisk ? true : undefined,
        ignore_reason_code: resolution_action === "ignored" ? ignoreReason : undefined,
        ignore_note: resolution_action === "ignored" ? ignoreNote || null : undefined,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    setFeedback(json.ok ? "Item resolved." : `Resolve failed: ${json.error ?? "unknown error"}`);
    await load();
  };

  const resolveBulk = async (resolution_action: "linked_to_existing" | "created_new" | "ignored") => {
    if (selectedIds.length === 0) return;
    const res = await fetch("/api/shop-boost/review-items/resolve-bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        review_item_ids: selectedIds,
        resolution_action,
        ignore_reason_code: resolution_action === "ignored" ? ignoreReason : undefined,
        ignore_note: resolution_action === "ignored" ? ignoreNote || null : undefined,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { results?: Array<{ ok: boolean }> };
    const okCount = (json.results ?? []).filter((item) => item.ok).length;
    setFeedback(`Bulk action complete (${okCount}/${selectedIds.length}).`);
    await load();
  };

  const runReprocess = async (mode: "failed" | "unresolved" | "updated_matches") => {
    setReprocessBusy(mode);
    try {
      const res = await fetch("/api/shop-boost/review-items/reprocess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, intake_id: items[0]?.intake_id, reprocess_reason: `operator_requested_${mode}` }),
      });
      const json = (await res.json().catch(() => ({}))) as { message?: string; results?: Array<{ ok: boolean }> };
      const okCount = (json.results ?? []).filter((row) => row.ok).length;
      setFeedback(`${json.message ?? "Reprocess completed."} (${okCount}/${json.results?.length ?? 0})`);
      await load();
    } finally {
      setReprocessBusy(null);
    }
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]));
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <h1 className="text-xl font-semibold text-white">Shop Boost Guided Review</h1>
        <p className="mt-1 text-sm text-neutral-300">Resolve migration issues safely with recommendations, confidence signals, and downstream impact visibility.</p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-neutral-300">
          {Object.entries(grouped).map(([key, count]) => (
            <span key={key} className="rounded-full border border-white/15 px-2 py-1">{key}: {count}</span>
          ))}
        </div>
        {guidance ? (
          <div className={`mt-3 rounded-lg border px-3 py-2 text-sm ${guidance.is_operational_ready ? "border-emerald-400/35 bg-emerald-950/30 text-emerald-100" : "border-amber-400/35 bg-amber-950/20 text-amber-100"}`}>
            {guidance.is_operational_ready ? "READY_FOR_GO_LIVE: You can start using ProFixIQ now." : "NOT_READY: Complete required actions before go-live."}
            <div className="mt-1 text-xs text-neutral-200">Blockers: {guidance.operational_blockers_count} • Non-blocking issues: {guidance.non_blocking_issues_count} • High-risk actions: {guidance.high_risk_actions_count ?? 0}</div>
            {(guidance.integrity_errors ?? []).length > 0 ? <div className="mt-1 text-xs text-rose-200">Integrity issues: {(guidance.integrity_errors ?? []).join(" • ")}</div> : null}
          </div>
        ) : null}
        {feedback ? <div className="mt-3 rounded-lg border border-sky-400/30 bg-sky-950/20 px-3 py-2 text-sm text-sky-100">{feedback}</div> : null}
      </div>

      <div className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-xs uppercase tracking-[0.16em] text-neutral-400">Filter by domain</label>
            <select value={domain} onChange={(e) => setDomain(e.target.value)} className="mt-2 w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 text-sm text-white">
              {domains.map((d) => <option key={d || "all"} value={d}>{d || "all domains"}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs uppercase tracking-[0.16em] text-neutral-400">Filter by status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="mt-2 w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 text-sm text-white">
              <option value="pending">pending</option>
              <option value="failed_materialization">failed materialization</option>
              <option value="materialized">materialized</option>
              <option value="ignored">ignored</option>
            </select>
          </div>
        </div>
        <label className="inline-flex items-center gap-2 text-xs text-neutral-300"><input type="checkbox" checked={debugView} onChange={(e) => setDebugView(e.target.checked)} /> Advanced debug view</label>

        <div className="grid gap-2 md:grid-cols-3 text-xs">
          <button className="rounded border border-emerald-300/40 px-2 py-1 text-emerald-100" onClick={() => void applyAllHighConfidence()}>Apply HIGH confidence only (≥85%)</button>
          <button className="rounded border border-amber-300/40 px-2 py-1 text-amber-100" onClick={() => void runReprocess("failed")} disabled={reprocessBusy !== null}>{reprocessBusy === "failed" ? "Re-running…" : "Re-run failed items"}</button>
          <button className="rounded border border-white/25 px-2 py-1 text-neutral-200" onClick={() => void runReprocess("unresolved")} disabled={reprocessBusy !== null}>{reprocessBusy === "unresolved" ? "Re-running…" : "Re-run unresolved items"}</button>
          <button className="rounded border border-sky-300/40 px-2 py-1 text-sky-100 md:col-span-3" onClick={() => void runReprocess("updated_matches")} disabled={reprocessBusy !== null}>{reprocessBusy === "updated_matches" ? "Re-running…" : "Re-run with updated matches"}</button>
        </div>

        <div>
          <label className="text-xs uppercase tracking-[0.16em] text-neutral-400">Ignore reason</label>
          <select value={ignoreReason} onChange={(e) => setIgnoreReason(e.target.value)} className="mt-2 w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 text-sm text-white">
            {["duplicate", "obsolete", "invalid", "test_data", "intentionally_skipped", "unsupported_format", "other"].map((reason) => <option key={reason} value={reason}>{reason}</option>)}
          </select>
          <input value={ignoreNote} onChange={(e) => setIgnoreNote(e.target.value)} placeholder="Optional ignore note" className="mt-2 w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 text-sm text-white" />
        </div>

        {selectedIds.length > 0 ? (
          <div className="flex flex-wrap gap-2 text-xs">
            <button className="rounded border border-sky-300/40 px-2 py-1 text-sky-100" onClick={() => void resolveBulk("linked_to_existing")}>Bulk link to existing</button>
            <button className="rounded border border-emerald-300/40 px-2 py-1 text-emerald-100" onClick={() => void resolveBulk("created_new")}>Bulk create new</button>
            <button className="rounded border border-white/25 px-2 py-1 text-neutral-200" onClick={() => void resolveBulk("ignored")}>Bulk ignore</button>
          </div>
        ) : null}
      </div>

      {loading ? <div className="text-sm text-neutral-400">Loading review queue…</div> : items.length === 0 ? (
        <div className="rounded-xl border border-emerald-300/20 bg-emerald-950/20 p-3 text-sm text-emerald-100">No items for this filter.</div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="rounded-xl border border-white/10 bg-black/25 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex gap-2">
                  <input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => toggleSelected(item.id)} className="mt-1" />
                  <div>
                    <div className="text-sm font-semibold text-white">{item.summary}</div>
                    <div className="text-xs text-neutral-400">{item.domain} • {item.issue_type} • {item.status}</div>
                    <div className="mt-1 text-xs text-neutral-500">target: {item.target_domain ?? item.domain} • cluster: {item.cluster_key ?? "n/a"} ({item.cluster_confidence?.toFixed(2) ?? "0.00"})</div>
                    {item.blocking_reason ? <div className="text-xs text-amber-200">Blocker: {item.blocking_reason}</div> : null}
                    <div className="text-xs text-neutral-300">What is wrong: {item.summary}</div>
                    <div className="text-xs text-neutral-300">Why it happened: {item.recommendation.recommendationReason}</div>
                    {(item.downstream_impact_count ?? 0) > 0 ? <div className="text-xs text-sky-200">This will unblock {item.downstream_impact_count} downstream records in {(item.affected_domains ?? []).join(", ") || "related domains"}.</div> : null}
                  </div>
                </div>

                <div className="w-full max-w-sm rounded-lg border border-white/15 bg-black/30 p-2 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-neutral-100">Suggested: {actionLabel(item.recommendation.recommendedAction)}</div>
                    <span className={`rounded-full px-2 py-0.5 ${item.recommendation.confidenceLabel === "HIGH" ? "bg-emerald-400/20 text-emerald-100" : item.recommendation.confidenceLabel === "MEDIUM" ? "bg-amber-400/20 text-amber-100" : "bg-rose-400/20 text-rose-100"}`}>
                      {item.recommendation.confidenceLabel} {(item.recommendation.recommendationConfidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  {item.recommendation.candidateTargets.length > 0 ? (
                    <div className="mt-1 text-neutral-400">Candidates: {item.recommendation.candidateTargets.map((t) => `${t.label} (${Math.round(t.score * 100)}%)`).join(" • ")}</div>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button className="rounded border border-emerald-300/40 px-2 py-1 text-emerald-100 disabled:opacity-50" disabled={item.recommendation.blockedAutoApply} onClick={() => void applySuggested(item)}>Apply suggested fix</button>
                    <button className="rounded border border-sky-300/40 px-2 py-1 text-sky-100" onClick={() => void resolveSingle(item, "linked_to_existing")}>Manual link</button>
                    <button className="rounded border border-white/25 px-2 py-1 text-neutral-200" onClick={() => void resolveSingle(item, "created_new")}>Manual create</button>
                  </div>
                  {isHighRiskItem(item, "linked_to_existing") ? (
                    <label className="mt-2 inline-flex items-center gap-2 text-[11px] text-amber-200">
                      <input type="checkbox" checked={Boolean(confirmRiskById[item.id])} onChange={(e) => setConfirmRiskById((prev) => ({ ...prev, [item.id]: e.target.checked }))} />
                      High-risk action confirmation required.
                    </label>
                  ) : null}
                </div>
              </div>

              {item.materialized_record ? <div className="mt-2 text-xs text-emerald-200">Resolved + Applied → {JSON.stringify(item.materialized_record)}</div> : null}
              {item.status === "ignored" ? <div className="mt-1 text-xs text-neutral-300">Ignored ({item.ignore_reason_code ?? "other"}) {item.ignore_note ? `• ${item.ignore_note}` : ""}</div> : null}
              {item.materialization_error ? <div className="mt-1 text-xs text-rose-300">Materialization error: {item.materialization_error}</div> : null}

              {debugView ? <div className="mt-3 grid gap-3 md:grid-cols-3">
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
              </div> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
