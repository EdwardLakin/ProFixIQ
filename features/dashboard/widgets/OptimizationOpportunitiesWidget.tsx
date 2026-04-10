"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import DashboardWidgetShell from "@/features/dashboard/components/DashboardWidgetShell";
import type {
  OptimizationActionType,
  OptimizationApplyPayload,
  OptimizationOpportunity,
} from "@/features/optimization/types";

function badgeTone(type: OptimizationOpportunity["optimizationType"]): string {
  if (type === "pricing_normalization") return "text-[color:var(--brand-primary)]";
  if (type === "inspection_coverage_gap") return "text-sky-300";
  return "text-[color:var(--brand-accent)]";
}

function typeLabel(type: OptimizationOpportunity["optimizationType"]): string {
  if (type === "pricing_normalization") return "Pricing";
  if (type === "inspection_coverage_gap") return "Inspection";
  return "Missed revenue";
}

function actionTypeForOpportunity(type: OptimizationOpportunity["optimizationType"]): OptimizationActionType {
  if (type === "pricing_normalization") return "pricing";
  if (type === "inspection_coverage_gap") return "inspection";
  return "revenue";
}

function confidenceLabel(confidence: number): string {
  if (confidence >= 0.85) return "High confidence";
  if (confidence >= 0.6) return "Review recommended";
  return "Low confidence";
}

function toNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseCurrentPriceFromSource(sourceBasis: string[]): number | null {
  const anchor = sourceBasis.find((line) => line.toLowerCase().includes("current menu price observed at"));
  if (!anchor) return null;
  const match = anchor.match(/\$([0-9]+(?:\.[0-9]+)?)/);
  if (!match) return null;
  return toNumber(match[1]);
}

function getApplyPayload(opportunity: OptimizationOpportunity): OptimizationApplyPayload {
  const actionType = actionTypeForOpportunity(opportunity.optimizationType);
  const meta = (opportunity.meta ?? {}) as Record<string, unknown>;

  if (actionType === "pricing") {
    const menuItemRef = opportunity.targetRefs.find((ref) => ref.entityType === "menu_item");
    return {
      menuItemId: menuItemRef?.id,
      newPrice: toNumber(meta.recommendedPrice) ?? undefined,
      suggestionData: {
        title: opportunity.title,
        summary: opportunity.summary,
        sourceBasis: opportunity.sourceBasis,
      },
    };
  }

  if (actionType === "inspection") {
    return {
      inspectionTemplate: {
        templateName: opportunity.title.replace(/^Inspection coverage gap:\s*/i, "").trim() || opportunity.title,
        description: opportunity.summary,
        sections: {
          optimization_recommended: {
            title: "Optimization recommendation",
            items: opportunity.sourceBasis.map((basis, idx) => ({ id: `basis_${idx + 1}`, label: basis })),
          },
        },
      },
      suggestionData: {
        sourceBasis: opportunity.sourceBasis,
      },
    };
  }

  return {
    suggestionData: {
      title: opportunity.title,
      summary: opportunity.summary,
      reason: opportunity.suggestedAction,
      confidence: opportunity.confidence,
      estimatedValue: opportunity.estimatedValue,
    },
  };
}

export default function OptimizationOpportunitiesWidget({
  shopId,
}: {
  shopId: string | null;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [opportunities, setOpportunities] = useState<OptimizationOpportunity[]>([]);
  const [selected, setSelected] = useState<OptimizationOpportunity | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [actionsByOpportunityId, setActionsByOpportunityId] = useState<Record<string, "applied" | "dismissed">>({});

  useEffect(() => {
    if (!shopId) return;

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/optimization/opportunities?limit=6", {
          method: "GET",
          cache: "no-store",
        });

        const payload = (await response.json().catch(() => null)) as {
          opportunities?: OptimizationOpportunity[];
          error?: string;
        } | null;

        if (!response.ok) {
          throw new Error(payload?.error || "Failed to load optimization opportunities");
        }

        if (!cancelled) {
          setOpportunities(payload?.opportunities ?? []);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load optimization opportunities");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [shopId]);

  const top = useMemo(() => opportunities.slice(0, 4), [opportunities]);

  async function dismissOpportunity(opportunity: OptimizationOpportunity) {
    setSubmittingId(opportunity.id);
    setError(null);
    try {
      const response = await fetch("/api/optimization/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opportunityId: opportunity.id,
          type: actionTypeForOpportunity(opportunity.optimizationType),
        }),
      });

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Failed to dismiss opportunity");
      }

      setActionsByOpportunityId((prev) => ({ ...prev, [opportunity.id]: "dismissed" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to dismiss opportunity");
    } finally {
      setSubmittingId(null);
    }
  }

  async function confirmApply(opportunity: OptimizationOpportunity) {
    setSubmittingId(opportunity.id);
    setError(null);

    try {
      const response = await fetch("/api/optimization/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opportunityId: opportunity.id,
          type: actionTypeForOpportunity(opportunity.optimizationType),
          payload: getApplyPayload(opportunity),
        }),
      });

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Failed to apply opportunity");
      }

      setActionsByOpportunityId((prev) => ({ ...prev, [opportunity.id]: "applied" }));
      setSelected(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to apply opportunity");
    } finally {
      setSubmittingId(null);
    }
  }

  return (
    <>
      <DashboardWidgetShell
        eyebrow="AI · Optimization"
        title="Optimization opportunities"
        subtitle="Reviewable recommendations only. Nothing auto-applies."
        rightSlot={
          <Link
            href="/dashboard/owner/reports"
            className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs font-semibold text-neutral-200 transition hover:bg-black/45"
          >
            Review data →
          </Link>
        }
      >
        {loading ? (
          <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-4 text-sm text-neutral-300">
            Scanning pricing, inspections, and revenue patterns…
          </div>
        ) : error ? (
          <div className="rounded-xl border border-[color:color-mix(in_srgb,var(--brand-accent)_45%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-accent)_14%,transparent)] px-4 py-4 text-sm text-[color:var(--brand-accent)]">
            {error}
          </div>
        ) : top.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-4 text-sm text-neutral-300">
            No high-signal opportunities right now. Keep capturing clean line, labor, and inspection data.
          </div>
        ) : (
          <div className="grid gap-3">
            <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-[11px] text-neutral-400">
              Suggestions are advisory only. Confirm with your team before changing menu pricing or inspection templates.
            </div>

            {top.map((opportunity) => {
              const actionState = actionsByOpportunityId[opportunity.id];
              const meta = (opportunity.meta ?? {}) as Record<string, unknown>;
              const jobsAnalyzed =
                toNumber(meta.jobsAnalyzed) ??
                toNumber(meta.jobs) ??
                toNumber(meta.sourceFamilyCount) ??
                toNumber(meta.flaggedFindings);

              return (
                <div
                  key={opportunity.id}
                  className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className={["text-[11px] uppercase tracking-[0.15em]", badgeTone(opportunity.optimizationType)].join(" ")}>
                      {typeLabel(opportunity.optimizationType)} · {Math.round(opportunity.confidence * 100)}% confidence
                    </div>
                    <div className="text-[10px] uppercase tracking-[0.14em] text-neutral-500">
                      {opportunity.impactLevel} impact
                    </div>
                  </div>

                  <div className="mt-1 text-sm font-semibold text-neutral-100">{opportunity.title}</div>
                  <div className="mt-1 text-xs text-neutral-300">{opportunity.summary}</div>
                  <div className="mt-2 text-[11px] text-neutral-400">Suggested action: {opportunity.suggestedAction}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-neutral-400">
                    <span className="rounded-full border border-white/10 px-2 py-0.5">
                      {confidenceLabel(opportunity.confidence)}
                    </span>
                    {typeof opportunity.estimatedValue === "number" ? (
                      <span>Est. value ${opportunity.estimatedValue.toFixed(2)}</span>
                    ) : null}
                    {jobsAnalyzed ? <span>Based on {jobsAnalyzed} jobs</span> : null}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setSelected(opportunity)}
                      disabled={Boolean(actionState) || submittingId === opportunity.id}
                      className="rounded-lg bg-[color:var(--brand-primary)] px-3 py-1.5 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {actionState === "applied" ? "Applied" : "Apply"}
                    </button>
                    <button
                      type="button"
                      onClick={() => dismissOpportunity(opportunity)}
                      disabled={Boolean(actionState) || submittingId === opportunity.id}
                      className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-neutral-200 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {actionState === "dismissed" ? "Dismissed" : "Dismiss"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelected(opportunity)}
                      className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-neutral-300"
                    >
                      View details
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DashboardWidgetShell>

      {selected ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/65 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-white/15 bg-[#101114] p-5 text-neutral-100 shadow-2xl">
            <div className="text-xs uppercase tracking-[0.16em] text-neutral-400">Apply suggestion</div>
            <h3 className="mt-1 text-lg font-semibold">{selected.title}</h3>
            <p className="mt-2 text-sm text-neutral-300">{selected.summary}</p>
            <div className="mt-3 space-y-1 text-xs text-neutral-400">
              <div>Why: {selected.sourceBasis.join(" · ")}</div>
              <div>Confidence: {Math.round(selected.confidence * 100)}% ({confidenceLabel(selected.confidence)})</div>
              {typeof selected.estimatedValue === "number" ? <div>Estimated value: ${selected.estimatedValue.toFixed(2)}</div> : null}
            </div>

            <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-neutral-300">
              {actionTypeForOpportunity(selected.optimizationType) === "pricing" ? (
                <>
                  <div className="font-semibold text-neutral-100">Pricing preview</div>
                  <div className="mt-1">
                    {(() => {
                      const currentPrice = parseCurrentPriceFromSource(selected.sourceBasis);
                      const nextPrice = Number((selected.meta as Record<string, unknown> | undefined)?.recommendedPrice ?? 0);
                      return (
                        <>
                          Current price → New price: <span className="text-neutral-100">{typeof currentPrice === "number" ? `$${currentPrice.toFixed(2)}` : "Not available"}</span> →
                          <span className="text-neutral-100"> ${nextPrice.toFixed(2)}</span>
                        </>
                      );
                    })()}
                  </div>
                </>
              ) : null}

              {actionTypeForOpportunity(selected.optimizationType) === "inspection" ? (
                <>
                  <div className="font-semibold text-neutral-100">Inspection preview</div>
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {selected.sourceBasis.slice(0, 3).map((basis) => (
                      <li key={basis}>{basis}</li>
                    ))}
                  </ul>
                </>
              ) : null}

              {actionTypeForOpportunity(selected.optimizationType) === "revenue" ? (
                <>
                  <div className="font-semibold text-neutral-100">Missed revenue preview</div>
                  <div className="mt-1">Suggested service: {selected.title}</div>
                  <div className="mt-1">Reason: {selected.suggestedAction}</div>
                </>
              ) : null}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-neutral-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmApply(selected)}
                disabled={submittingId === selected.id}
                className="rounded-lg bg-[color:var(--brand-primary)] px-3 py-2 text-xs font-semibold text-black disabled:opacity-40"
              >
                Confirm Apply
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
