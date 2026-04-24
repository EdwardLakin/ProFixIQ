"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@shared/lib/utils";
import { PANEL_VARIANTS } from "@/features/shared/components/ui/panelHierarchy";

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

export default function WorkOrderAiOperationalRecommendations({ workOrderId }: { workOrderId: string }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<RecommendationRow[]>([]);
  const [evidence, setEvidence] = useState<EvidenceRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/work-orders/${workOrderId}/ai/recommendations`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to load operational recommendations.");
      setRecommendations(Array.isArray(json.recommendations) ? json.recommendations : []);
      setEvidence(json.evidenceSnapshot ?? null);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate operational recommendations.");
    } finally {
      setRefreshing(false);
    }
  }, [workOrderId]);

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
          {recommendations.map((item) => (
            <article key={item.id} className={cn(PANEL_VARIANTS.passive, "p-2")}> 
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-foreground">{item.title}</p>
                <span className="rounded-full border border-white/20 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{item.priority}</span>
                <span className="rounded-full border border-white/20 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">risk {item.risk_tier}</span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">{item.summary ?? "Operational review suggested."}</p>
              <div className="mt-1 text-[10px] text-muted-foreground">
                Confidence: {typeof item.confidence === "number" ? item.confidence.toFixed(2) : "—"} • Missing data: {item.missing_data?.length ?? 0} • Next: {item.recommended_action?.label ?? "Review work order"}
              </div>
            </article>
          ))}
        </div>
      ) : null}

      <p className="mt-2 text-[10px] text-muted-foreground">{freshnessLabel} • Generated by work order rules.</p>
    </section>
  );
}
