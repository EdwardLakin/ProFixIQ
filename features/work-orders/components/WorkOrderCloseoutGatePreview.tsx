"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@shared/lib/utils";
import { PANEL_VARIANTS } from "@/features/shared/components/ui/panelHierarchy";

type CloseoutGatePreviewItem = {
  recommendationId: string;
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  reason: string;
  recommendedNextStep: string;
  missingData: string[];
  source: string;
  status: string;
  wouldBlockIfEnabled: boolean;
};

type CloseoutGatePreviewDto = {
  workOrderId: string;
  mode: "preview_only";
  enabled: false;
  wouldBlockIfEnabled: boolean;
  blockingCandidateCount: number;
  advisoryCount: number;
  missingDataCount: number;
  highestSeverity: "low" | "medium" | "high" | "critical" | null;
  generatedAt: string | null;
  freshnessAt: string | null;
  stale: boolean;
  items: CloseoutGatePreviewItem[];
  executionBlocked: true;
  closeoutCurrentlyBlocked: false;
  emptyStateHint?: string;
};

function severityBadgeClass(severity: CloseoutGatePreviewItem["severity"]): string {
  if (severity === "critical") return "border-red-400/60 text-red-200";
  if (severity === "high") return "border-orange-400/60 text-orange-200";
  if (severity === "medium") return "border-amber-400/60 text-amber-200";
  return "border-white/20 text-neutral-300";
}

export default function WorkOrderCloseoutGatePreview({ workOrderId }: { workOrderId: string }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<CloseoutGatePreviewDto | null>(null);

  const load = useCallback(async (isRefresh: boolean) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    setError(null);
    try {
      const res = await fetch(`/api/work-orders/${workOrderId}/ai/closeout-gate-preview`, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as CloseoutGatePreviewDto | { error?: string } | null;

      if (!res.ok) {
        const message = json && typeof json === "object" && "error" in json ? json.error : null;
        throw new Error(message || "Failed to load closeout gate preview.");
      }

      setPreview((json ?? null) as CloseoutGatePreviewDto | null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load closeout gate preview.");
    } finally {
      if (isRefresh) setRefreshing(false);
      else setLoading(false);
    }
  }, [workOrderId]);

  useEffect(() => {
    void load(false);
  }, [load]);

  const topItems = useMemo(() => {
    if (!preview?.items?.length) return [];
    return preview.items.slice(0, 5);
  }, [preview?.items]);

  return (
    <section className={cn(PANEL_VARIANTS.secondary, "p-3")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">AI closeout gate preview</h2>
            <span className="rounded-full border border-[rgba(184,115,51,0.5)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[rgba(184,115,51,0.95)]">
              Preview only
            </span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">Preview only — ProFixIQ is not blocking closeout yet.</p>
          <p className="mt-1 text-[11px] text-muted-foreground">These are evidence-backed checks that would become closeout gates if enabled later.</p>
          <p className="mt-1 text-[11px] text-muted-foreground">No customer message, invoice, or work-order change is made from this panel.</p>
        </div>
        <button
          type="button"
          className="rounded-md border border-[rgba(184,115,51,0.5)] px-2 py-1 text-[11px] font-medium text-[rgba(184,115,51,0.95)] hover:bg-[rgba(184,115,51,0.12)] disabled:opacity-50"
          onClick={() => void load(true)}
          disabled={refreshing}
        >
          {refreshing ? "Refreshing…" : "Refresh preview"}
        </button>
      </div>

      {loading ? <p className="mt-2 text-[11px] text-muted-foreground">Loading AI closeout gate preview…</p> : null}
      {error ? <p className="mt-2 text-[11px] text-red-300">{error}</p> : null}

      {!loading && !error && preview ? (
        <>
          <div className="mt-2 grid gap-2 text-[11px] text-muted-foreground sm:grid-cols-2 xl:grid-cols-4">
            <div className={cn(PANEL_VARIANTS.passive, "p-2")}>
              <p className="uppercase tracking-[0.14em]">Closeout status</p>
              <p className="mt-1 text-neutral-200">Not currently blocking closeout</p>
            </div>
            <div className={cn(PANEL_VARIANTS.passive, "p-2")}>
              <p className="uppercase tracking-[0.14em]">Would block if enabled</p>
              <p className="mt-1 text-neutral-200">{preview.blockingCandidateCount}</p>
            </div>
            <div className={cn(PANEL_VARIANTS.passive, "p-2")}>
              <p className="uppercase tracking-[0.14em]">Advisory items</p>
              <p className="mt-1 text-neutral-200">{preview.advisoryCount}</p>
            </div>
            <div className={cn(PANEL_VARIANTS.passive, "p-2")}>
              <p className="uppercase tracking-[0.14em]">Missing-data items</p>
              <p className="mt-1 text-neutral-200">{preview.missingDataCount}</p>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span>Highest severity: {preview.highestSeverity ?? "none"}</span>
            <span>•</span>
            <span>{preview.stale ? "Stale or needs refresh" : "Fresh"}</span>
            {preview.freshnessAt ? (
              <>
                <span>•</span>
                <span>Evidence freshness: {new Date(preview.freshnessAt).toLocaleString()}</span>
              </>
            ) : null}
          </div>

          {topItems.length > 0 ? (
            <ul className="mt-2 space-y-2">
              {topItems.map((item) => (
                <li key={item.recommendationId} className={cn(PANEL_VARIANTS.passive, "p-2")}>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{item.title}</p>
                    <span className={cn("rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide", severityBadgeClass(item.severity))}>
                      {item.severity}
                    </span>
                    {item.wouldBlockIfEnabled ? (
                      <span className="rounded-full border border-[rgba(184,115,51,0.5)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[rgba(184,115,51,0.95)]">
                        Would block if enabled
                      </span>
                    ) : (
                      <span className="rounded-full border border-white/20 px-2 py-0.5 text-[10px] uppercase tracking-wide text-neutral-300">
                        Advisory today
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">{item.reason}</p>
                  <p className="mt-1 text-[11px] text-[rgba(184,115,51,0.95)]">Review the items before finalizing.</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">Next step: {item.recommendedNextStep}</p>
                  {item.missingData.length > 0 ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Missing data means ProFixIQ cannot prove the closeout is clean yet: {item.missingData.join(", ")}.
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <div className={cn(PANEL_VARIANTS.passive, "mt-2 p-2 text-[11px] text-muted-foreground")}>
              {preview.emptyStateHint ?? "No closeout preview items yet."}
            </div>
          )}

          <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
            <Link href={`/work-orders/${workOrderId}#ai-operational-recommendations`} className="text-[rgba(184,115,51,0.95)] hover:underline">
              Open work-order AI operational recommendations
            </Link>
            <span className="text-muted-foreground">•</span>
            <Link href="/dashboard/ai-recommendations" className="text-[rgba(184,115,51,0.95)] hover:underline">
              Open AI recommendations review center
            </Link>
          </div>
        </>
      ) : null}
    </section>
  );
}
