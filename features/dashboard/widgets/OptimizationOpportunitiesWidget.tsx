"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import DashboardWidgetShell from "@/features/dashboard/components/DashboardWidgetShell";
import type {
  OptimizationActionType,
  OptimizationApplyPayload,
  OptimizationOpportunity,
} from "@/features/optimization/types";

type ActionState = "applied" | "dismissed";
type ActionsApiItem = {
  opportunityId: string;
  action: ActionState;
  type: OptimizationActionType;
  createdAt: string;
};
type OpportunityFilter = "active" | "all" | "applied" | "dismissed";

const ACTIONS_SESSION_CACHE_KEY = "optimization-actions-cache-v1";

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

function formatEstimatedImpact(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return "Potential impact detected";
  }

  const rounded = Math.round(value);
  return `Estimated impact: +${new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(rounded)}/month`;
}

function getWhyThisMatters(opportunity: OptimizationOpportunity): string[] {
  const entries = [...opportunity.sourceBasis];
  const meta = (opportunity.meta ?? {}) as Record<string, unknown>;
  const jobsCount =
    toNumber(meta.jobsAnalyzed) ??
    toNumber(meta.jobs) ??
    toNumber(meta.sourceFamilyCount) ??
    toNumber(meta.flaggedFindings);

  if (jobsCount && jobsCount > 0) {
    entries.push(`Based on ${Math.round(jobsCount)} jobs from your shop history`);
  }

  if (opportunity.optimizationType === "pricing_normalization") {
    entries.push("Price varies significantly across similar jobs");
  } else if (opportunity.optimizationType === "inspection_coverage_gap") {
    entries.push("This service is not consistently inspected");
  } else {
    entries.push("Common companion services are missing");
  }

  return entries;
}

function readActionsCache(shopId: string): Record<string, ActionState> | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(ACTIONS_SESSION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { shopId?: string; actions?: Record<string, ActionState> };
    if (parsed?.shopId !== shopId || !parsed.actions || typeof parsed.actions !== "object") {
      return null;
    }

    return parsed.actions;
  } catch {
    return null;
  }
}

function writeActionsCache(shopId: string, actions: Record<string, ActionState>) {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(ACTIONS_SESSION_CACHE_KEY, JSON.stringify({ shopId, actions }));
  } catch {
    // intentionally best-effort only
  }
}

function toOpportunityPath(type: OptimizationActionType, entityId: string | null): string {
  if (type === "pricing") {
    return entityId ? `/menu/item/${entityId}` : "/menu";
  }

  if (type === "inspection") {
    return entityId ? `/inspections/templates?templateId=${entityId}` : "/inspections/templates";
  }

  return entityId ? `/menu_item_suggestions?highlight=${entityId}` : "/menu_item_suggestions";
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
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [opportunities, setOpportunities] = useState<OptimizationOpportunity[]>([]);
  const [selected, setSelected] = useState<OptimizationOpportunity | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [actionsByOpportunityId, setActionsByOpportunityId] = useState<Record<string, ActionState>>({});
  const [filter, setFilter] = useState<OpportunityFilter>("active");

  useEffect(() => {
    if (!shopId) return;

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);

      try {
        const cachedActions = readActionsCache(shopId);
        if (cachedActions && !cancelled) {
          setActionsByOpportunityId(cachedActions);
        }

        const [opportunitiesResponse, actionsResponse] = await Promise.all([
          fetch("/api/optimization/opportunities?limit=6", {
            method: "GET",
            cache: "no-store",
          }),
          fetch("/api/optimization/actions", {
            method: "GET",
            cache: "no-store",
          }),
        ]);

        const opportunitiesPayload = (await opportunitiesResponse.json().catch(() => null)) as {
          opportunities?: OptimizationOpportunity[];
          error?: string;
        } | null;

        if (!opportunitiesResponse.ok) {
          throw new Error(opportunitiesPayload?.error || "Failed to load optimization opportunities");
        }

        const actionsPayload = (await actionsResponse.json().catch(() => null)) as
          | ActionsApiItem[]
          | { error?: string }
          | null;

        if (!actionsResponse.ok) {
          throw new Error(
            (actionsPayload && !Array.isArray(actionsPayload) ? actionsPayload.error : null) ||
              "Failed to load optimization action history",
          );
        }

        const hydratedActions = (Array.isArray(actionsPayload) ? actionsPayload : []).reduce<
          Record<string, ActionState>
        >((acc, action) => {
          if (!action.opportunityId) return acc;
          acc[action.opportunityId] = action.action;
          return acc;
        }, {});

        if (!cancelled) {
          setOpportunities(opportunitiesPayload?.opportunities ?? []);
          setActionsByOpportunityId(hydratedActions);
          writeActionsCache(shopId, hydratedActions);
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

  const visibleOpportunities = useMemo(() => {
    const enriched = opportunities.map((opportunity) => ({
      opportunity,
      actionState: actionsByOpportunityId[opportunity.id],
    }));

    const filtered = enriched.filter(({ actionState }) => {
      if (filter === "all") return true;
      if (filter === "active") return !actionState;
      if (filter === "applied") return actionState === "applied";
      return actionState === "dismissed";
    });

    return filtered.slice(0, 4);
  }, [actionsByOpportunityId, filter, opportunities]);

  const hasOnlyCompleted = useMemo(() => {
    if (opportunities.length === 0) return false;

    return opportunities.every((opportunity) => {
      const action = actionsByOpportunityId[opportunity.id];
      return action === "applied" || action === "dismissed";
    });
  }, [actionsByOpportunityId, opportunities]);

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

      setActionsByOpportunityId((prev) => {
        const next = { ...prev, [opportunity.id]: "dismissed" as const };
        if (shopId) writeActionsCache(shopId, next);
        return next;
      });
      toast.success("Opportunity dismissed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to dismiss opportunity");
      toast.error(e instanceof Error ? e.message : "Failed to dismiss opportunity");
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

      const payload = (await response.json().catch(() => null)) as
        | {
            success?: boolean;
            type?: OptimizationActionType;
            entityId?: string | null;
            message?: string;
            error?: string;
          }
        | null;
      if (!response.ok || !payload?.success || !payload.type) {
        throw new Error(payload?.error ?? "Failed to apply opportunity");
      }

      setActionsByOpportunityId((prev) => {
        const next = { ...prev, [opportunity.id]: "applied" as const };
        if (shopId) writeActionsCache(shopId, next);
        return next;
      });
      setSelected(null);

      const destination = toOpportunityPath(payload.type, payload.entityId ?? null);
      const actionLabel =
        payload.type === "pricing"
          ? "View menu item"
          : payload.type === "inspection"
            ? "View inspection template"
            : "View suggestion";

      toast.success("Change applied successfully", {
        description: payload.message,
        action: {
          label: actionLabel,
          onClick: () => router.push(destination),
        },
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to apply opportunity";
      setError(message);
      toast.error(message);
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
        ) : opportunities.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-4 text-sm text-neutral-300">
            No high-signal opportunities right now. Keep capturing clean line, labor, and inspection data.
          </div>
        ) : (
          <div className="grid gap-3">
            <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-[11px] text-neutral-400">
              Suggestions are advisory only. Confirm with your team before changing menu pricing or inspection templates.
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {([
                ["active", "Active"],
                ["all", "All"],
                ["applied", "Applied"],
                ["dismissed", "Dismissed"],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  className={[
                    "rounded-full border px-2.5 py-1 text-[11px] transition",
                    filter === value
                      ? "border-[color:var(--brand-primary)] bg-[color:color-mix(in_srgb,var(--brand-primary)_24%,transparent)] text-[color:var(--brand-primary)]"
                      : "border-white/10 bg-black/20 text-neutral-300 hover:border-white/20",
                  ].join(" ")}
                >
                  {label}
                </button>
              ))}
            </div>

            {visibleOpportunities.length === 0 && hasOnlyCompleted && filter === "active" ? (
              <div className="rounded-xl border border-[color:color-mix(in_srgb,var(--brand-primary)_25%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-primary)_10%,transparent)] px-4 py-4 text-sm text-neutral-200">
                <div className="font-semibold text-[color:var(--brand-primary)]">You&apos;re fully optimized (for now)</div>
                <div className="mt-1 text-xs text-neutral-300">
                  We&apos;ll surface new opportunities as your shop data evolves.
                </div>
              </div>
            ) : visibleOpportunities.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-4 text-sm text-neutral-300">
                No opportunities in this filter right now.
              </div>
            ) : null}

            {visibleOpportunities.map(({ opportunity, actionState }) => {
              const isApplied = actionState === "applied";
              const isDismissed = actionState === "dismissed";
              const whyThisMatters = getWhyThisMatters(opportunity);

              return (
                <div
                  key={opportunity.id}
                  className={[
                    "rounded-2xl px-4 py-3",
                    isApplied
                      ? "border border-emerald-500/35 bg-[color:color-mix(in_srgb,rgba(16,185,129,0.18)_55%,black)]"
                      : isDismissed
                        ? "border border-white/8 bg-black/15"
                        : "border border-white/10 bg-black/25",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className={["text-[11px] uppercase tracking-[0.15em]", badgeTone(opportunity.optimizationType)].join(" ")}>
                      {typeLabel(opportunity.optimizationType)} · {Math.round(opportunity.confidence * 100)}% confidence
                    </div>
                    <div className="flex items-center gap-2">
                      {isApplied ? (
                        <span className="rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-300">
                          Applied
                        </span>
                      ) : null}
                      {isDismissed ? (
                        <span className="rounded-full border border-white/15 bg-black/35 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
                          Dismissed
                        </span>
                      ) : null}
                      <div className="text-[10px] uppercase tracking-[0.14em] text-neutral-500">
                        {opportunity.impactLevel} impact
                      </div>
                    </div>
                  </div>

                  <div className="mt-1 text-sm font-semibold text-neutral-100">{opportunity.title}</div>

                  {!isDismissed ? (
                    <>
                      <div className="mt-1 text-xs text-neutral-300">{opportunity.summary}</div>
                      <div className="mt-2 text-[11px] text-neutral-400">Suggested action: {opportunity.suggestedAction}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-neutral-400">
                        <span className="rounded-full border border-white/10 px-2 py-0.5">
                          {confidenceLabel(opportunity.confidence)}
                        </span>
                        <span>{formatEstimatedImpact(opportunity.estimatedValue)}</span>
                      </div>

                      <div className="mt-3 rounded-xl border border-white/10 bg-black/25 p-2.5 text-[11px] text-neutral-300">
                        <div className="font-semibold uppercase tracking-[0.12em] text-neutral-200">Why this matters</div>
                        <ul className="mt-1.5 space-y-1">
                          {whyThisMatters.slice(0, 3).map((item) => (
                            <li key={item}>• {item}</li>
                          ))}
                        </ul>
                      </div>
                    </>
                  ) : (
                    <div className="mt-2 text-xs text-neutral-400">Hidden from active recommendations.</div>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setSelected(opportunity)}
                      disabled={Boolean(actionState) || submittingId === opportunity.id}
                      className="rounded-lg bg-[color:var(--brand-primary)] px-3 py-1.5 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {isApplied ? "Applied" : "Apply"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void dismissOpportunity(opportunity)}
                      disabled={Boolean(actionState) || submittingId === opportunity.id}
                      className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-neutral-200 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {isDismissed ? "Dismissed" : "Dismiss"}
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
              <div>Confidence: {Math.round(selected.confidence * 100)}% ({confidenceLabel(selected.confidence)})</div>
              <div>{formatEstimatedImpact(selected.estimatedValue)}</div>
            </div>

            <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-neutral-300">
              <div className="font-semibold uppercase tracking-[0.12em] text-neutral-100">Why this matters</div>
              <ul className="mt-1.5 space-y-1">
                {getWhyThisMatters(selected).map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
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
                disabled={submittingId === selected.id || Boolean(actionsByOpportunityId[selected.id])}
                className="rounded-lg bg-[color:var(--brand-primary)] px-3 py-2 text-xs font-semibold text-black disabled:opacity-40"
              >
                {actionsByOpportunityId[selected.id] === "applied" ? "Applied" : "Confirm Apply"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
