"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

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
  review_explanation: string;
  recommendation_explanation: string;
  decision_transparency: {
    confidence_score: number;
    reasoning: string;
    candidates: Array<{ id: string; label: string; score: number }>;
    raw_data: Record<string, unknown>;
    normalized_data: Record<string, unknown>;
  };
};

type Guidance = {
  is_operational_ready: boolean;
  operational_blockers_count: number;
  non_blocking_issues_count: number;
  integrity_errors?: string[];
  high_risk_actions_count?: number;
};
type ReviewSummary = {
  domain_counts: Record<string, number>;
  status_counts: Record<string, number>;
  unresolved_total: number;
  blockers_total: number;
  row_accounting: {
    total_input: number;
    materialized: number;
    linked: number;
    ignored: number;
    review_required: number;
    failed: number;
    total_counted: number;
    mismatch: number;
  };
};

type ResetCounts = {
  intakes: number;
  reviewItems: number;
  rowResults: number;
  reviewAuditEvents: number;
  integrityReports: number;
  importFiles: number;
  importRows: number;
  staffInviteSuggestions: number;
  staffInviteCandidates: number;
  provenance: Record<"customer" | "vehicle" | "work_order" | "work_order_line" | "invoice", number>;
  legacyTagged: {
    customers: number;
    vehicles: number;
    workOrders: number;
    workOrderLines: number;
    invoices: number;
  };
};

type ResetPreviewResponse = {
  ok?: boolean;
  error?: string;
  intakeId?: string | null;
  expectedConfirmationText?: string;
  counts?: ResetCounts;
};

type ResetExecuteResponse = {
  ok?: boolean;
  error?: string;
  expectedConfirmationText?: string;
  previewCounts?: ResetCounts;
  deletedCounts?: Record<string, number>;
  notes?: {
    deletedUsingStrongProvenance?: Record<string, number>;
    legacyTaggedNotDeleted?: Record<string, number>;
  };
};

type ResetPrecheckState = "checking" | "ready" | "blocked";

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
  const router = useRouter();
  const supabase = useMemo(() => createClientComponentClient<Database>(), []);
  const [domain, setDomain] = useState("");
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [ignoreReason, setIgnoreReason] = useState("duplicate");
  const [ignoreNote, setIgnoreNote] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [guidance, setGuidance] = useState<Guidance | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [reprocessBusy, setReprocessBusy] = useState<null | "failed" | "unresolved" | "updated_matches">(null);
  const [confirmRiskById, setConfirmRiskById] = useState<Record<string, boolean>>({});
  const [resetIntakeId, setResetIntakeId] = useState("");
  const [resetPreview, setResetPreview] = useState<ResetPreviewResponse | null>(null);
  const [resetExecute, setResetExecute] = useState<ResetExecuteResponse | null>(null);
  const [resetFeedback, setResetFeedback] = useState<string | null>(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetExecuting, setResetExecuting] = useState(false);
  const [resetAllowed, setResetAllowed] = useState(false);
  const [resetPermissionChecked, setResetPermissionChecked] = useState(false);
  const [resetPrecheckState, setResetPrecheckState] = useState<ResetPrecheckState>("checking");
  const [resetBlockedReason, setResetBlockedReason] = useState<string | null>(null);
  const [confirmationText, setConfirmationText] = useState("");
  const [dryRunComplete, setDryRunComplete] = useState(false);
  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [activeIntakeId, setActiveIntakeId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (domain) params.set("domain", domain);
    if (statusFilter) params.set("status", statusFilter);
    const res = await fetch(`/api/shop-boost/review-items?${params.toString()}`, { cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; items?: ReviewItem[]; guidance?: Guidance; summary?: ReviewSummary };
    const nextItems = json.ok ? json.items ?? [] : [];
    setItems(nextItems);
    if (nextItems[0]?.intake_id) {
      setActiveIntakeId((prev) => prev || nextItems[0].intake_id);
    }
    setSummary(json.summary ?? null);
    setGuidance(json.guidance ?? null);
    setSelectedIds([]);
    setLoading(false);
  }, [domain, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!resetIntakeId && activeIntakeId) {
      setResetIntakeId(activeIntakeId);
    }
  }, [activeIntakeId, resetIntakeId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const auth = await supabase.auth.getUser();
      const userId = auth.data.user?.id;
      if (!userId) {
        if (!cancelled) setViewerRole(null);
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle<{ role: string | null }>();
      if (!cancelled) setViewerRole(data?.role ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/shop-boost/intakes/latest", { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as { ok?: boolean; intake?: { id?: string | null } | null } | null;
        const intakeId = String(json?.intake?.id ?? "").trim();
        if (!cancelled && intakeId) setActiveIntakeId(intakeId);
      } catch {
        // no-op: keep existing intake fallback from loaded review rows
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const intakeId = resetIntakeId || activeIntakeId || items[0]?.intake_id;
      if (!intakeId) {
        setResetPermissionChecked(true);
        setResetAllowed(false);
        setResetPrecheckState("blocked");
        setResetBlockedReason("No intake is currently selected. Load review items first, then target a specific intake ID.");
        return;
      }
      setResetPermissionChecked(false);
      setResetPrecheckState("checking");
      setResetBlockedReason(null);
      try {
        const params = new URLSearchParams({ scope: "intake", intakeId });
        const res = await fetch(`/api/shop-boost/import-reset?${params.toString()}`, { cache: "no-store" });
        if (cancelled) return;
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        const allowed = res.ok && json.ok === true;
        setResetAllowed(allowed);
        if (allowed) {
          setResetPrecheckState("ready");
          setResetBlockedReason(null);
        } else {
          setResetPrecheckState("blocked");
          setResetBlockedReason(json.error ?? "Reset precheck failed. Owner/admin role and valid intake scope are required.");
        }
      } catch {
        if (cancelled) return;
        setResetAllowed(false);
        setResetPrecheckState("blocked");
        setResetBlockedReason("Reset precheck request failed. Check your session/permissions and retry.");
      } finally {
        if (!cancelled) setResetPermissionChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeIntakeId, items, resetIntakeId]);


  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    let delayMs = 5000;

    const pollReadiness = async () => {
      try {
        const res = await fetch("/api/shop-boost/intakes/latest", { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as
          | {
              ok?: boolean;
              intake?: { readiness?: { ui_should_route_forward?: boolean } | null } | null;
            }
          | null;

        if (!cancelled && json?.ok && json.intake?.readiness?.ui_should_route_forward === true) {
          router.replace("/dashboard?setup=shop-boost");
          return;
        }
      } catch {
        delayMs = Math.min(delayMs + 2000, 15000);
      }

      if (!cancelled) {
        timer = window.setTimeout(() => {
          void pollReadiness();
        }, delayMs);
      }
    };

    timer = window.setTimeout(() => {
      void pollReadiness();
    }, delayMs);

    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [router]);

  const grouped = useMemo(
    () => summary?.domain_counts ?? {},
    [summary],
  );
  const isOwnerOrAdmin = viewerRole === "owner" || viewerRole === "admin";

  const isHighRiskItem = (item: ReviewItem, action: "linked_to_existing" | "created_new" | "ignored") =>
    action === "linked_to_existing" && item.recommendation.recommendedAction === "merge_candidate";

  const stepCounts = useMemo(() => {
    const critical = items.filter((item) => Boolean(item.blocking_reason));
    const suggested = items.filter((item) => !item.blocking_reason && item.recommendation.confidenceLabel !== "LOW");
    const cleanup = items.filter((item) => !critical.includes(item) && !suggested.includes(item));
    return {
      critical,
      suggested,
      cleanup,
    };
  }, [items]);

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

  const loadResetPreview = async () => {
    if (!resetIntakeId.trim()) {
      setResetFeedback("Select or enter an intake ID first.");
      return;
    }
    setResetLoading(true);
    setResetFeedback(null);
    setResetExecute(null);
    setDryRunComplete(false);
    try {
      const params = new URLSearchParams({ scope: "intake", intakeId: resetIntakeId.trim() });
      const res = await fetch(`/api/shop-boost/import-reset?${params.toString()}`, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as ResetPreviewResponse;
      if (!res.ok || !json.ok) {
        setResetPreview(null);
        setResetFeedback(json.error ?? "Failed to load reset preview.");
        return;
      }
      setResetPreview(json);
      setConfirmationText("");
      setResetFeedback("Preview loaded. Run dry-run to write a preview audit event, then execute only if needed.");
    } finally {
      setResetLoading(false);
    }
  };

  const runResetDryRun = async () => {
    if (!resetPreview?.expectedConfirmationText || !resetIntakeId.trim()) {
      setResetFeedback("Load preview first.");
      return;
    }
    setResetLoading(true);
    setResetFeedback(null);
    try {
      const res = await fetch("/api/shop-boost/import-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: "intake",
          intakeId: resetIntakeId.trim(),
          dryRun: true,
          confirmationText: resetPreview.expectedConfirmationText,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as ResetPreviewResponse;
      if (!res.ok || !json.ok) {
        setResetFeedback(json.error ?? "Dry-run failed.");
        return;
      }
      setDryRunComplete(true);
      setResetPreview(json);
      setResetFeedback("Dry-run recorded. Review counts and enter confirmation text to execute.");
    } finally {
      setResetLoading(false);
    }
  };

  const executeReset = async () => {
    if (!resetPreview?.expectedConfirmationText || !resetIntakeId.trim()) {
      setResetFeedback("Load preview first.");
      return;
    }
    setResetExecuting(true);
    setResetFeedback(null);
    try {
      const res = await fetch("/api/shop-boost/import-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: "intake",
          intakeId: resetIntakeId.trim(),
          dryRun: false,
          confirmationText,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as ResetExecuteResponse;
      if (!res.ok || !json.ok) {
        setResetExecute(null);
        setResetFeedback(json.error ?? "Reset execute failed.");
        if (json.expectedConfirmationText) {
          setResetPreview((prev) => ({
            ...prev,
            expectedConfirmationText: json.expectedConfirmationText,
          }));
        }
        return;
      }
      setResetExecute(json);
      setResetFeedback("Import reset completed. Review deleted counts and legacy counts below.");
      await load();
    } finally {
      setResetExecuting(false);
    }
  };

  const previewCounts = resetPreview?.counts;
  const confirmationMatches = confirmationText.trim() === (resetPreview?.expectedConfirmationText ?? "");
  const disableResetActions = !resetAllowed || resetPrecheckState !== "ready";

  return (
    <div
      className="space-y-4"
      style={{
        ["--dashboard-shell-bg" as string]:
          "radial-gradient(1200px_640px_at_14%_-8%, color-mix(in srgb, #38bdf8 8%, transparent), transparent 62%), radial-gradient(1100px_700px_at_100%_100%, rgba(2,6,23,0.52), transparent 64%), linear-gradient(180deg, var(--theme-app-bg, #050910) 0%, var(--theme-app-bg, #050910) 100%)",
      }}
    >
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <h1 className="text-xl font-semibold text-white">Shop Boost Guided Review</h1>
        <p className="mt-1 text-sm text-neutral-300">Resolve migration issues in guided steps with transparent reasoning and confidence-backed actions.</p>
        <p className="mt-1 text-xs text-neutral-400">This page keeps checking readiness in the background and will auto-continue once activation truth flips ready.</p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-neutral-300">
          {Object.entries(grouped).map(([key, count]) => (
            <span key={key} className="rounded-full border border-white/15 px-2 py-1">{key}: {count}</span>
          ))}
        </div>
        {summary ? (
          <div className="mt-3 rounded-lg border border-white/15 bg-black/35 px-3 py-2 text-xs text-neutral-200">
            Intake truth: input {summary.row_accounting.total_input} • bucketed {summary.row_accounting.total_counted} • mismatch {summary.row_accounting.mismatch}
          </div>
        ) : null}
        {guidance ? (
          <div className={`mt-3 rounded-lg border px-3 py-2 text-sm ${guidance.is_operational_ready ? "border-emerald-400/35 bg-emerald-950/30 text-emerald-100" : "border-white/15 bg-black/30 text-neutral-100"}`}>
            {guidance.is_operational_ready ? "READY_FOR_GO_LIVE: You can start using ProFixIQ now." : "NOT_READY: Complete required actions before go-live."}
            <div className="mt-1 text-xs text-neutral-200">Blockers: {guidance.operational_blockers_count} • Non-blocking issues: {guidance.non_blocking_issues_count} • High-risk actions: {guidance.high_risk_actions_count ?? 0}</div>
            {(guidance.integrity_errors ?? []).length > 0 ? <div className="mt-1 text-xs text-rose-200">Integrity issues: {(guidance.integrity_errors ?? []).join(" • ")}</div> : null}
          </div>
        ) : null}
        {feedback ? <div className="mt-3 rounded-lg border border-sky-400/30 bg-sky-950/20 px-3 py-2 text-sm text-sky-100">{feedback}</div> : null}
      </div>

      {isOwnerOrAdmin ? (
        <section className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Reset this intake</h2>
            <p className="mt-1 text-xs text-neutral-200">
              Owner/admin only. Scoped reset for a single intake only. This uses provenance-backed deletion for imported records and does not expose any global shop wipe action.
            </p>
          </div>
          <div className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-xs text-neutral-200">
            {!resetPermissionChecked || resetPrecheckState === "checking" ? (
              <span>Checking reset prerequisites…</span>
            ) : resetPrecheckState === "ready" ? (
              <span className="text-emerald-200">Precheck passed: owner/admin access confirmed and intake scope is valid.</span>
            ) : (
              <span className="text-amber-200">Reset unavailable: {resetBlockedReason ?? "Unknown precheck failure."}</span>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-[1.7fr_1fr]">
            <div>
              <label className="text-xs uppercase tracking-[0.16em] text-neutral-400">Intake scope (required)</label>
              <input
                value={resetIntakeId}
                onChange={(e) => {
                  setResetIntakeId(e.target.value);
                  setResetPreview(null);
                  setResetExecute(null);
                  setDryRunComplete(false);
                  setConfirmationText("");
                }}
                placeholder="Paste intake UUID"
                className="mt-2 w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"
              />
            </div>
            <div className="flex items-end">
              <button className="w-full rounded border border-sky-300/40 px-3 py-2 text-xs text-sky-100 disabled:opacity-60" onClick={() => void loadResetPreview()} disabled={resetLoading || resetExecuting || disableResetActions}>
                {resetLoading ? "Loading preview…" : "Load exact preview counts"}
              </button>
            </div>
          </div>

          {previewCounts ? (
            <div className="space-y-3 rounded-lg border border-white/15 bg-black/30 p-3">
              <div className="grid gap-3 md:grid-cols-2 text-xs">
                <div className="rounded-md border border-emerald-300/35 bg-emerald-950/20 p-2">
                  <div className="font-semibold text-emerald-100">Safe provenance-backed deletion</div>
                  <ul className="mt-1 space-y-1 text-neutral-200">
                    <li>Customers: {previewCounts.provenance.customer}</li>
                    <li>Vehicles: {previewCounts.provenance.vehicle}</li>
                    <li>Work orders: {previewCounts.provenance.work_order}</li>
                    <li>Work order lines: {previewCounts.provenance.work_order_line}</li>
                    <li>Invoices: {previewCounts.provenance.invoice}</li>
                  </ul>
                </div>
                <div className="rounded-md border border-cyan-300/30 bg-cyan-950/15 p-2">
                  <div className="font-semibold text-cyan-100">Legacy-tagged counts (not auto-deleted)</div>
                  <ul className="mt-1 space-y-1 text-neutral-200">
                    <li>Customers: {previewCounts.legacyTagged.customers}</li>
                    <li>Vehicles: {previewCounts.legacyTagged.vehicles}</li>
                    <li>Work orders: {previewCounts.legacyTagged.workOrders}</li>
                    <li>Work order lines: {previewCounts.legacyTagged.workOrderLines}</li>
                    <li>Invoices: {previewCounts.legacyTagged.invoices}</li>
                  </ul>
                </div>
              </div>

              <div className="grid gap-2 text-xs md:grid-cols-2">
                <div className="rounded-md border border-white/10 p-2 text-neutral-200">Intake rows: {previewCounts.intakes}</div>
                <div className="rounded-md border border-white/10 p-2 text-neutral-200">Review items: {previewCounts.reviewItems}</div>
                <div className="rounded-md border border-white/10 p-2 text-neutral-200">Row results: {previewCounts.rowResults}</div>
                <div className="rounded-md border border-white/10 p-2 text-neutral-200">Review audit events: {previewCounts.reviewAuditEvents}</div>
                <div className="rounded-md border border-white/10 p-2 text-neutral-200">Integrity reports: {previewCounts.integrityReports}</div>
                <div className="rounded-md border border-white/10 p-2 text-neutral-200">Import files: {previewCounts.importFiles}</div>
                <div className="rounded-md border border-white/10 p-2 text-neutral-200">Import rows: {previewCounts.importRows}</div>
                <div className="rounded-md border border-white/10 p-2 text-neutral-200">Staff invite suggestions: {previewCounts.staffInviteSuggestions}</div>
                <div className="rounded-md border border-white/10 p-2 text-neutral-200">Staff invite candidates: {previewCounts.staffInviteCandidates}</div>
              </div>

              <div className="rounded-md border border-white/15 bg-black/40 p-2 text-xs text-neutral-200">
                <div className="font-semibold text-white">Required confirmation text</div>
                <div className="mt-1 break-all font-mono text-[11px]">{resetPreview?.expectedConfirmationText}</div>
                <button
                  type="button"
                  className="mt-2 rounded border border-white/20 px-2 py-1 text-[11px] text-neutral-100"
                  onClick={() => setConfirmationText(resetPreview?.expectedConfirmationText ?? "")}
                >
                  Use expected text
                </button>
              </div>

              <input
                value={confirmationText}
                onChange={(e) => setConfirmationText(e.target.value)}
                placeholder="Type exact confirmation text to enable execute"
                className="w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 text-xs text-white"
              />

              <div className="flex flex-wrap gap-2 text-xs">
                <button
                  type="button"
                  className="rounded border border-sky-300/40 px-2 py-1 text-sky-100"
                  onClick={() => void runResetDryRun()}
                  disabled={resetLoading || resetExecuting || disableResetActions}
                >
                  {resetLoading ? "Running dry-run…" : dryRunComplete ? "Dry-run completed ✓" : "Run dry-run preview"}
                </button>
                <button
                  type="button"
                  className="rounded border border-rose-300/40 px-2 py-1 text-rose-100 disabled:opacity-60"
                  onClick={() => void executeReset()}
                  disabled={!dryRunComplete || !confirmationMatches || resetExecuting || disableResetActions}
                >
                  {resetExecuting ? "Executing reset…" : "Execute intake reset"}
                </button>
              </div>

              <p className="text-[11px] text-neutral-400">
                Execute is locked until dry-run is completed and confirmation text exactly matches. No global delete-all-shop action is surfaced here.
              </p>
            </div>
          ) : null}

          {resetExecute?.deletedCounts ? (
            <div className="rounded-lg border border-emerald-300/30 bg-emerald-950/20 p-3 text-xs text-emerald-100">
              <div className="font-semibold">Audit result • deleted counts</div>
              <pre className="mt-2 overflow-auto rounded border border-white/10 bg-black/40 p-2 text-[11px] text-neutral-100">{JSON.stringify(resetExecute.deletedCounts, null, 2)}</pre>
              {resetExecute.notes?.legacyTaggedNotDeleted ? (
                <div className="mt-2 text-cyan-100">
                  Legacy-tagged records still not auto-deleted:
                  <pre className="mt-1 overflow-auto rounded border border-cyan-300/25 bg-black/40 p-2 text-[11px] text-neutral-100">{JSON.stringify(resetExecute.notes.legacyTaggedNotDeleted, null, 2)}</pre>
                </div>
              ) : null}
            </div>
          ) : null}

          {resetFeedback ? <div className="rounded-lg border border-sky-400/30 bg-sky-950/20 px-3 py-2 text-xs text-sky-100">{resetFeedback}</div> : null}
        </section>
      ) : (
        <section className="rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="text-xs text-neutral-300">Intake reset controls are visible to owner/admin roles only.</div>
        </section>
      )}

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

        <div className="grid gap-2 md:grid-cols-3 text-xs">
          <button className="rounded border border-emerald-300/40 px-2 py-1 text-emerald-100" onClick={() => void applyAllHighConfidence()}>Apply HIGH confidence only (≥85%)</button>
          <button className="rounded border border-amber-300/40 px-2 py-1 text-amber-100" onClick={() => void runReprocess("failed")} disabled={reprocessBusy !== null}>{reprocessBusy === "failed" ? "Re-running…" : "Re-run failed items"}</button>
          <button className="rounded border border-white/25 px-2 py-1 text-neutral-200" onClick={() => void runReprocess("unresolved")} disabled={reprocessBusy !== null}>{reprocessBusy === "unresolved" ? "Re-running…" : "Re-run unresolved items"}</button>
          <button className="rounded border border-sky-300/40 px-2 py-1 text-sky-100 md:col-span-3" onClick={() => void runReprocess("updated_matches")} disabled={reprocessBusy !== null}>{reprocessBusy === "updated_matches" ? "Re-running…" : "Re-run with updated matches"}</button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {[
          { key: "critical", title: "Step 1: Resolve critical blockers", rows: stepCounts.critical, cta: "Resolve blocker" },
          { key: "suggested", title: "Step 2: Review suggested fixes", rows: stepCounts.suggested, cta: "Apply suggested" },
          { key: "cleanup", title: "Step 3: Optional clean-up", rows: stepCounts.cleanup, cta: "Clean up" },
        ].map((step) => (
          <details key={step.key} className="rounded-xl border border-white/10 bg-black/20 p-3" open={step.rows.length > 0}>
            <summary className="cursor-pointer text-sm font-semibold text-white">{step.title}</summary>
            <div className="mt-2 text-xs text-neutral-300">{step.rows.length} item(s) in this step.</div>
            {step.rows.length === 0 ? <div className="mt-2 text-xs text-emerald-200">Complete ✅</div> : <div className="mt-2 text-xs text-neutral-400">Use item actions below to {step.cta.toLowerCase()}.</div>}
          </details>
        ))}
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
                    {item.blocking_reason ? <div className="text-xs text-amber-200">Blocker: {item.blocking_reason}</div> : null}
                    <div className="mt-1 text-xs text-neutral-200">Why this needs review: {item.review_explanation}</div>
                    <div className="text-xs text-sky-200">Suggested reasoning: {item.recommendation_explanation}</div>
                    {(item.downstream_impact_count ?? 0) > 0 ? <div className="text-xs text-emerald-200">This can unblock {item.downstream_impact_count} downstream records in {(item.affected_domains ?? []).join(", ") || "related domains"}.</div> : null}
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

              <details className="mt-3 rounded-lg border border-white/10 bg-black/30 p-2">
                <summary className="cursor-pointer text-xs font-medium text-neutral-100">Decision transparency panel</summary>
                <div className="mt-2 grid gap-3 md:grid-cols-3">
                  <div>
                    <div className="mb-1 text-xs uppercase tracking-[0.14em] text-neutral-500">Raw data</div>
                    <pre className="max-h-64 overflow-auto rounded border border-white/10 bg-black/40 p-2 text-xs text-neutral-200">{JSON.stringify(item.decision_transparency.raw_data ?? {}, null, 2)}</pre>
                  </div>
                  <div>
                    <div className="mb-1 text-xs uppercase tracking-[0.14em] text-neutral-500">Normalized data</div>
                    <pre className="max-h-64 overflow-auto rounded border border-white/10 bg-black/40 p-2 text-xs text-neutral-200">{JSON.stringify(item.decision_transparency.normalized_data ?? {}, null, 2)}</pre>
                  </div>
                  <div>
                    <div className="mb-1 text-xs uppercase tracking-[0.14em] text-neutral-500">Candidates + confidence</div>
                    <div className="mb-2 text-xs text-neutral-300">Confidence score: {(item.decision_transparency.confidence_score * 100).toFixed(0)}%</div>
                    <div className="mb-2 text-xs text-neutral-300">Reasoning: {item.decision_transparency.reasoning}</div>
                    <pre className="max-h-64 overflow-auto rounded border border-white/10 bg-black/40 p-2 text-xs text-neutral-200">{JSON.stringify(item.decision_transparency.candidates ?? [], null, 2)}</pre>
                  </div>
                </div>
              </details>

              {item.materialized_record ? <div className="mt-2 text-xs text-emerald-200">Resolved + Applied → {JSON.stringify(item.materialized_record)}</div> : null}
              {item.status === "ignored" ? <div className="mt-1 text-xs text-neutral-300">Ignored ({item.ignore_reason_code ?? "other"}) {item.ignore_note ? `• ${item.ignore_note}` : ""}</div> : null}
              {item.materialization_error ? <div className="mt-1 text-xs text-rose-300">Materialization error: {item.materialization_error}</div> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
