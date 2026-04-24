"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { cn } from "@shared/lib/utils";
import { PANEL_VARIANTS } from "@/features/shared/components/ui/panelHierarchy";

type RecommendationLifecycleAction = "acknowledge" | "dismiss" | "resolve";

type RecommendationRow = {
  id: string;
  title: string;
  summary: string | null;
  priority: "low" | "normal" | "high" | "urgent";
  confidence: number | null;
  risk_tier: "low" | "medium" | "high" | "critical";
  status: string;
  recommended_action: {
    label?: string;
    details?: string;
  } | null;
  recommendation_type: string;
  metadata?: {
    risk_code?: string;
    advisory_only?: boolean;
    blocks_closeout?: boolean;
  } | null;
  missing_data: string[] | null;
  created_at: string;
};

type EvidenceRow = {
  id: string;
  freshness_at: string | null;
  confidence: number | null;
  missing_data: string[] | null;
  created_at: string;
};

type PreviewPayloadRecord = {
  label?: string;
  description?: string;
  affected_records?: Array<{ type?: string; id?: string }>;
  intended_mutations?: unknown[];
  side_effects?: string[];
  requires_approval?: boolean;
  requires_owner_pin?: boolean;
  risk_tier?: string;
  blocked_execution_reason?: string;
  evidence_snapshot_id?: string | null;
};

type PreviewRow = {
  id: string;
  recommendation_id: string | null;
  preview_payload: PreviewPayloadRecord;
  intended_mutations: unknown[];
  affected_records: Array<{ type?: string; id?: string }>;
  side_effects: string[];
  requires_approval: boolean;
  requires_owner_pin: boolean;
  risk_tier: string;
  evidence_snapshot_id: string | null;
  created_at: string;
};

type AdvisorDraftSection = {
  heading: string;
  bullets: string[];
};

type AdvisorDraft = {
  title: string;
  audience: "internal_advisor";
  advisoryOnly: true;
  evidenceSnapshotId: string;
  recommendationId: string | null;
  workOrderId: string;
  sections: AdvisorDraftSection[];
  missingData: string[];
  confidence: number;
  warnings: string[];
  prohibitedActions: string[];
};

function isPreviewableRecommendation(item: RecommendationRow): boolean {
  return item.risk_tier !== "critical";
}

function parsePreview(raw: unknown): PreviewRow | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.id !== "string") return null;

  const previewPayload = value.preview_payload && typeof value.preview_payload === "object"
    ? (value.preview_payload as PreviewPayloadRecord)
    : {};

  return {
    id: value.id,
    recommendation_id: typeof value.recommendation_id === "string" ? value.recommendation_id : null,
    preview_payload: previewPayload,
    intended_mutations: Array.isArray(value.intended_mutations) ? value.intended_mutations : [],
    affected_records: Array.isArray(value.affected_records) ? (value.affected_records as Array<{ type?: string; id?: string }>) : [],
    side_effects: Array.isArray(value.side_effects) ? (value.side_effects as string[]) : [],
    requires_approval: Boolean(value.requires_approval),
    requires_owner_pin: Boolean(value.requires_owner_pin),
    risk_tier: typeof value.risk_tier === "string" ? value.risk_tier : "low",
    evidence_snapshot_id: typeof value.evidence_snapshot_id === "string" ? value.evidence_snapshot_id : null,
    created_at: typeof value.created_at === "string" ? value.created_at : "",
  };
}

export default function WorkOrderAiOperationalRecommendations({ workOrderId }: { workOrderId: string }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<RecommendationRow[]>([]);
  const [evidence, setEvidence] = useState<EvidenceRow | null>(null);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
  const [previewByRecommendationId, setPreviewByRecommendationId] = useState<Record<string, PreviewRow>>({});
  const [advisorDraft, setAdvisorDraft] = useState<AdvisorDraft | null>(null);
  const [advisorDraftLoading, setAdvisorDraftLoading] = useState(false);
  const [advisorDraftRefreshing, setAdvisorDraftRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/work-orders/${workOrderId}/ai/recommendations`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to load operational recommendations.");
      setRecommendations(Array.isArray(json.recommendations) ? json.recommendations : []);
      setEvidence(json.evidenceSnapshot ?? null);

      setAdvisorDraftLoading(true);
      try {
        const draftRes = await fetch(`/api/work-orders/${workOrderId}/ai/advisor-draft`, { cache: "no-store" });
        const draftJson = await draftRes.json();
        if (draftRes.ok && draftJson?.draft) {
          setAdvisorDraft(draftJson.draft as AdvisorDraft);
        } else {
          setAdvisorDraft(null);
        }
      } finally {
        setAdvisorDraftLoading(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load operational recommendations.");
    } finally {
      setLoading(false);
    }
  }, [workOrderId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onGenerate = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch(`/api/work-orders/${workOrderId}/ai/recommendations`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to generate operational recommendations.");
      setRecommendations(Array.isArray(json.recommendations) ? json.recommendations : []);
      setEvidence(json.evidenceSnapshot ?? null);
      toast.success("Operational recommendations refreshed.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to generate operational recommendations.";
      setError(message);
      toast.error(message);
    } finally {
      setRefreshing(false);
    }
  }, [workOrderId]);

  const onGenerateAdvisorDraft = useCallback(async () => {
    setAdvisorDraftRefreshing(true);
    setError(null);
    try {
      const res = await fetch(`/api/work-orders/${workOrderId}/ai/advisor-draft`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to generate advisor explanation draft.");
      if (!json?.draft) throw new Error("Advisor draft response was invalid.");
      setAdvisorDraft(json.draft as AdvisorDraft);
      toast.success("Internal advisor draft generated.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to generate advisor explanation draft.";
      setError(message);
      toast.error(message);
    } finally {
      setAdvisorDraftRefreshing(false);
    }
  }, [workOrderId]);

  const onLifecycleAction = useCallback(
    async (recommendationId: string, action: RecommendationLifecycleAction) => {
      const actionKey = `${recommendationId}:${action}`;
      setActiveAction(actionKey);
      setError(null);

      try {
        const res = await fetch(`/api/work-orders/${workOrderId}/ai/recommendations/${recommendationId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action }),
        });

        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? "Failed to update recommendation.");

        const updated = json?.recommendation as RecommendationRow | undefined;
        if (!updated?.id) throw new Error("Updated recommendation response was invalid.");

        if (updated.status === "dismissed" || updated.status === "resolved") {
          setRecommendations((prev) => prev.filter((item) => item.id !== updated.id));
          setPreviewByRecommendationId((current) => {
            const copy = { ...current };
            delete copy[updated.id];
            return copy;
          });
        } else {
          setRecommendations((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
        }

        if (action === "acknowledge") {
          toast.success("Recommendation acknowledged.");
        } else if (action === "dismiss") {
          toast.success("Recommendation dismissed.");
        } else {
          toast.success("Recommendation marked resolved.");
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to update recommendation.";
        setError(message);
        toast.error(message);
      } finally {
        setActiveAction(null);
      }
    },
    [workOrderId],
  );

  const onPreviewAction = useCallback(
    async (recommendationId: string) => {
      setPreviewLoadingId(recommendationId);
      setError(null);

      try {
        const res = await fetch(`/api/work-orders/${workOrderId}/ai/recommendations/${recommendationId}/preview`, {
          method: "POST",
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? "Failed to generate action preview.");

        const parsed = parsePreview(json?.preview);
        if (!parsed) throw new Error("Preview response was invalid.");

        setPreviewByRecommendationId((prev) => ({
          ...prev,
          [recommendationId]: parsed,
        }));

        toast.success("Action preview generated.");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to generate action preview.";
        setError(message);
        toast.error(message);
      } finally {
        setPreviewLoadingId(null);
      }
    },
    [workOrderId],
  );

  const freshnessLabel = useMemo(() => {
    if (!evidence?.freshness_at) return "No evidence snapshot yet";
    return `Evidence freshness: ${new Date(evidence.freshness_at).toLocaleString()}`;
  }, [evidence?.freshness_at]);

  return (
    <section className={cn(PANEL_VARIANTS.secondary, "p-2")}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">AI operational recommendations</h2>
          <p className="mt-1 text-[11px] text-muted-foreground">Rules-based readiness signals. Read-only, no autonomous execution.</p>
        </div>
        <button
          type="button"
          className="rounded-md border border-[rgba(184,115,51,0.5)] px-2 py-1 text-[11px] font-medium text-[rgba(184,115,51,0.95)] hover:bg-[rgba(184,115,51,0.12)] disabled:opacity-50"
          onClick={() => void onGenerate()}
          disabled={refreshing}
        >
          {refreshing ? "Generating…" : "Generate / Refresh"}
        </button>
      </div>

      {loading ? <p className="mt-2 text-[11px] text-muted-foreground">Loading operational recommendations…</p> : null}
      {error ? <p className="mt-2 text-[11px] text-red-300">{error}</p> : null}

      {!loading && !error && recommendations.length === 0 ? (
        <div className={cn(PANEL_VARIANTS.passive, "mt-2 p-2 text-[11px] text-muted-foreground")}>
          No active operational recommendations. Generate a fresh evidence snapshot.
        </div>
      ) : null}

      {!loading && !error && recommendations.length > 0 ? (
        <div className="mt-2 space-y-2">
          {recommendations.map((item) => {
            const isRowBusy = activeAction?.startsWith(`${item.id}:`) ?? false;
            const preview = previewByRecommendationId[item.id];
            const previewable = isPreviewableRecommendation(item);
            const previewBusy = previewLoadingId === item.id;
            const isCloseoutRisk = item.recommendation_type.startsWith("closeout_risk_");
            const isPartsDelay = item.recommendation_type.startsWith("parts_delay_");
            const isDispatchReview = item.recommendation_type.startsWith("technician_dispatch_");
            const severityLabel = `severity ${item.risk_tier}`;
            const recommendedNextStep = item.recommended_action?.details ?? item.recommended_action?.label ?? "Review work order";

            return (
              <article key={item.id} className={cn(PANEL_VARIANTS.passive, "p-2")}>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-foreground">{item.title}</p>
                  {isCloseoutRisk ? (
                    <span className="rounded-full border border-[rgba(184,115,51,0.5)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[rgba(184,115,51,0.95)]">
                      Closeout review
                    </span>
                  ) : null}
                  {isPartsDelay ? (
                    <span className="rounded-full border border-[rgba(184,115,51,0.5)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[rgba(184,115,51,0.95)]">
                      Parts delay review
                    </span>
                  ) : null}
                  {isDispatchReview ? (
                    <span className="rounded-full border border-[rgba(184,115,51,0.5)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[rgba(184,115,51,0.95)]">
                      Dispatch review
                    </span>
                  ) : null}
                  <span className="rounded-full border border-white/20 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{item.priority}</span>
                  <span className="rounded-full border border-white/20 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{severityLabel}</span>
                  {item.status === "acknowledged" ? (
                    <span className="rounded-full border border-[rgba(184,115,51,0.5)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[rgba(184,115,51,0.95)]">acknowledged</span>
                  ) : null}
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">{item.summary ?? "Operational review suggested."}</p>
                {isCloseoutRisk ? (
                  <p className="mt-1 text-[10px] text-[rgba(184,115,51,0.95)]">Advisory only — does not block closeout yet.</p>
                ) : null}
                {isPartsDelay ? (
                  <p className="mt-1 text-[10px] text-[rgba(184,115,51,0.95)]">Advisory only — internal parts-delay review, no execution.</p>
                ) : null}
                {isDispatchReview ? (
                  <p className="mt-1 text-[10px] text-[rgba(184,115,51,0.95)]">Advisory only — internal dispatch review, no assignment/schedule/labor mutation.</p>
                ) : null}
                <div className="mt-1 text-[10px] text-muted-foreground">
                  Confidence: {typeof item.confidence === "number" ? item.confidence.toFixed(2) : "—"} • Missing data: {item.missing_data?.length ?? 0} • Next: {recommendedNextStep}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  {previewable ? (
                    <button
                      type="button"
                      className="rounded-md border border-[rgba(184,115,51,0.5)] px-2 py-1 text-[11px] text-[rgba(184,115,51,0.95)] transition hover:bg-[rgba(184,115,51,0.12)] disabled:opacity-50"
                      disabled={previewBusy}
                      onClick={() => void onPreviewAction(item.id)}
                    >
                      {previewBusy ? "Generating preview…" : "Preview action"}
                    </button>
                  ) : (
                    <span className="rounded-md border border-white/10 px-2 py-1 text-[10px] text-muted-foreground">Preview unavailable for critical-risk recommendation</span>
                  )}
                  <button
                    type="button"
                    className="rounded-md border border-white/20 px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-white/10 disabled:opacity-50"
                    disabled={isRowBusy || item.status === "acknowledged"}
                    onClick={() => void onLifecycleAction(item.id, "acknowledge")}
                  >
                    {activeAction === `${item.id}:acknowledge` ? "Acknowledging…" : "Acknowledge"}
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-white/20 px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-white/10 disabled:opacity-50"
                    disabled={isRowBusy}
                    onClick={() => void onLifecycleAction(item.id, "dismiss")}
                  >
                    {activeAction === `${item.id}:dismiss` ? "Dismissing…" : "Dismiss"}
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-white/20 px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-white/10 disabled:opacity-50"
                    disabled={isRowBusy}
                    onClick={() => void onLifecycleAction(item.id, "resolve")}
                  >
                    {activeAction === `${item.id}:resolve` ? "Resolving…" : "Mark resolved"}
                  </button>
                </div>

                {preview ? (
                  <div className="mt-2 rounded-md border border-white/10 bg-white/[0.02] p-2 text-[10px] text-muted-foreground">
                    <div className="text-[11px] font-medium text-foreground">{preview.preview_payload.label ?? "Action preview"}</div>
                    <p className="mt-1">{preview.preview_payload.description ?? "Preview generated for operational review."}</p>
                    <p className="mt-1">Affected records: {preview.affected_records.length}</p>
                    {preview.affected_records.length > 0 ? (
                      <ul className="mt-1 list-disc pl-4">
                        {preview.affected_records.map((record, idx) => (
                          <li key={`${preview.id}:record:${idx}`}>{record.type ?? "record"}: {record.id ?? "—"}</li>
                        ))}
                      </ul>
                    ) : null}
                    <p className="mt-1">Intended mutations: {preview.intended_mutations.length > 0 ? String(preview.intended_mutations.length) : "None — preview only"}</p>
                    <p className="mt-1">Side effects: {preview.side_effects.length > 0 ? preview.side_effects.join(" • ") : "No external side effects"}</p>
                    <p className="mt-1">Approval required: {preview.requires_approval ? "Yes" : "No"}</p>
                    <p className="mt-1">Owner PIN required: {preview.requires_owner_pin ? "Yes" : "No"}</p>
                    <p className="mt-1">Risk tier: {preview.risk_tier}</p>
                    <p className="mt-1">Execution status: Execution blocked — preview only</p>
                    <p className="mt-1">Evidence snapshot: {preview.evidence_snapshot_id ?? preview.preview_payload.evidence_snapshot_id ?? "Not linked"}</p>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : null}

      <div className={cn(PANEL_VARIANTS.passive, "mt-2 p-2")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-medium text-foreground">Advisor explanation draft</p>
            <p className="text-[10px] text-muted-foreground">Internal-only, advisory-only explanation prep from evidence snapshots.</p>
          </div>
          <button
            type="button"
            className="rounded-md border border-[rgba(184,115,51,0.5)] px-2 py-1 text-[11px] text-[rgba(184,115,51,0.95)] transition hover:bg-[rgba(184,115,51,0.12)] disabled:opacity-50"
            onClick={() => void onGenerateAdvisorDraft()}
            disabled={advisorDraftRefreshing}
          >
            {advisorDraftRefreshing ? "Generating draft…" : "Generate advisor draft"}
          </button>
        </div>

        {advisorDraftLoading ? <p className="mt-2 text-[10px] text-muted-foreground">Loading advisor draft…</p> : null}

        {advisorDraft ? (
          <div className="mt-2 rounded-md border border-white/10 bg-white/[0.02] p-2 text-[10px] text-muted-foreground">
            <div className="flex flex-wrap items-center gap-1">
              <span className="rounded-full border border-[rgba(184,115,51,0.5)] px-2 py-0.5 uppercase tracking-wide text-[9px] text-[rgba(184,115,51,0.95)]">internal-only</span>
              <span className="rounded-full border border-white/20 px-2 py-0.5 uppercase tracking-wide text-[9px] text-muted-foreground">advisory-only</span>
            </div>
            <p className="mt-1 text-[11px] font-medium text-foreground">{advisorDraft.title}</p>
            <p className="mt-1">Confidence: {advisorDraft.confidence.toFixed(2)} • Missing data: {advisorDraft.missingData.length}</p>
            <p className="mt-1">Evidence snapshot: {advisorDraft.evidenceSnapshotId}{advisorDraft.recommendationId ? ` • Recommendation: ${advisorDraft.recommendationId}` : ""}</p>

            <div className="mt-2 space-y-2">
              {advisorDraft.sections.map((section) => (
                <div key={section.heading}>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground">{section.heading}</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    {section.bullets.map((bullet, idx) => (
                      <li key={`${section.heading}:${idx}`}>{bullet}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {advisorDraft.warnings.length > 0 ? (
              <div className="mt-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground">Warnings</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {advisorDraft.warnings.map((warning, idx) => (
                    <li key={`warning:${idx}`}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {advisorDraft.prohibitedActions.length > 0 ? (
              <div className="mt-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground">Do not do</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {advisorDraft.prohibitedActions.map((item, idx) => (
                    <li key={`prohibit:${idx}`}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="mt-2 text-[10px] text-muted-foreground">No advisor draft yet. Generate one for internal review.</p>
        )}
      </div>

      <p className="mt-2 text-[10px] text-muted-foreground">{freshnessLabel} • Generated by work order rules.</p>
    </section>
  );
}
