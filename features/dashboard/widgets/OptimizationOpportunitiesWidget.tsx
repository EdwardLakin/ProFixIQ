"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import OptimizationExecutionModal from "../../../components/optimization/OptimizationExecutionModal";
import DashboardWidgetShell from "@/features/dashboard/components/DashboardWidgetShell";
import { toDashboardFallbackMessage } from "@/features/dashboard/lib/widget-fallback";
import type {
  ExecutionPreview,
  OptimizationActionType,
  OptimizationApplyPayload,
  OptimizationGroup,
  OptimizationOpportunity,
} from "@/features/optimization/types";

type ActionState = "applied" | "dismissed";
type ActionsApiItem = {
  opportunityId: string;
  action: ActionState;
  type: OptimizationActionType;
  createdAt: string;
  result?: string | null;
};
type OpportunityFilter = "active" | "all" | "applied" | "dismissed" | "critical";
type UndoAction = {
  opportunityId: string;
  type: OptimizationActionType;
  affectedEntityIds?: Record<string, string>;
  undoData?: Record<string, unknown>;
};

const ACTIONS_SESSION_CACHE_KEY = "optimization-actions-cache-v1";
const OPPORTUNITIES_SESSION_CACHE_KEY = "optimization-opportunities-cache-v1";
const OPTIMIZATION_WIDGETS_ENABLED =
  (process.env.NEXT_PUBLIC_AI_EXPERIMENTS_ENABLED ?? "").trim().toLowerCase() === "true";

function badgeTone(type: OptimizationOpportunity["type"]): string {
  if (type === "pricing_normalization") return "text-[color:var(--brand-primary)]";
  if (type === "inspection_coverage_gap") return "text-sky-300";
  return "text-[color:var(--brand-accent)]";
}

function typeLabel(type: OptimizationOpportunity["type"]): string {
  if (type === "pricing_normalization") return "Pricing";
  if (type === "inspection_coverage_gap") return "Inspection";
  return "Missed revenue";
}

function actionTypeForOpportunity(type: OptimizationOpportunity["type"]): OptimizationActionType {
  if (type === "pricing_normalization") return "pricing";
  if (type === "inspection_coverage_gap") return "inspection";
  return "revenue";
}

function confidenceLabel(confidence: number): string {
  if (confidence >= 0.85) return "High confidence";
  if (confidence >= 0.6) return "Review recommended";
  return "Low confidence";
}

function groupLabel(group: OptimizationGroup): string {
  if (!group.groupKey) return "Service optimization";
  return group.groupKey
    .replaceAll("__", " + ")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function priorityBadgeTone(band: OptimizationOpportunity["priorityBand"]): string {
  if (band === "critical") return "border-red-400/40 bg-red-500/15 text-red-200";
  if (band === "high") return "border-orange-400/40 bg-orange-500/15 text-orange-200";
  if (band === "medium") return "border-yellow-400/40 bg-yellow-500/15 text-yellow-100";
  return "border-white/15 bg-black/35 text-neutral-300";
}

function toNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
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
  const entries = opportunity.explanation?.operational.bullets ?? opportunity.reasoning.slice(0, 5);
  if (entries.length === 0) return [opportunity.sourceBasis];
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

function readOpportunitiesCache(shopId: string): {
  groups: OptimizationGroup[];
  summary: {
    totalOpportunities: number;
    criticalCount: number;
    highCount: number;
    potentialMonthlyValue: number;
    lastAnalyzedAt: string;
    dataFreshness: "fresh" | "stale";
  } | null;
} | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(OPPORTUNITIES_SESSION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      shopId?: string;
      groups?: OptimizationGroup[];
      summary?: {
        totalOpportunities: number;
        criticalCount: number;
        highCount: number;
        potentialMonthlyValue: number;
        lastAnalyzedAt: string;
        dataFreshness: "fresh" | "stale";
      };
    };
    if (parsed.shopId !== shopId || !Array.isArray(parsed.groups)) return null;
    return { groups: parsed.groups, summary: parsed.summary ?? null };
  } catch {
    return null;
  }
}

function writeOpportunitiesCache(
  shopId: string,
  groups: OptimizationGroup[],
  summary: {
    totalOpportunities: number;
    criticalCount: number;
    highCount: number;
    potentialMonthlyValue: number;
    lastAnalyzedAt: string;
    dataFreshness: "fresh" | "stale";
  } | null,
) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(OPPORTUNITIES_SESSION_CACHE_KEY, JSON.stringify({ shopId, groups, summary }));
  } catch {
    // best effort
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
  const actionType = actionTypeForOpportunity(opportunity.type);
  const meta = (opportunity.meta ?? {}) as Record<string, unknown>;

  if (actionType === "pricing") {
    return {
      menuItemId: opportunity.targetRefs?.menuItemId,
      newPrice: toNumber(meta.recommendedPrice) ?? undefined,
      newLaborHours: toNumber(meta.recommendedLaborHours) ?? undefined,
      suggestionData: {
        title: opportunity.title,
        summary: opportunity.summary,
        sourceBasis: [opportunity.sourceBasis, ...opportunity.reasoning],
      },
    };
  }

  if (actionType === "inspection") {
    return {
      menuItemId: opportunity.targetRefs?.menuItemId,
      inspectionTemplate: {
        templateId: opportunity.targetRefs?.inspectionTemplateId,
        templateName: opportunity.title.replace(/^Inspection coverage gap:\s*/i, "").trim() || opportunity.title,
        description: opportunity.summary,
        sections: {
          optimization_recommended: {
            title: "Optimization recommendation",
            items: opportunity.reasoning.map((basis, idx) => ({ id: `basis_${idx + 1}`, label: basis })),
          },
        },
      },
      suggestionData: {
        sourceBasis: [opportunity.sourceBasis, ...opportunity.reasoning],
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

type OptimizationOpportunitiesWidgetProps = {
  shopId: string | null;
  compact?: boolean;
};

export default function OptimizationOpportunitiesWidget(props: OptimizationOpportunitiesWidgetProps) {
  if (!OPTIMIZATION_WIDGETS_ENABLED) {
    return null;
  }

  return <OptimizationOpportunitiesWidgetInner {...props} />;
}

function OptimizationOpportunitiesWidgetInner({
  shopId,
  compact = false,
}: OptimizationOpportunitiesWidgetProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{
    totalOpportunities: number;
    criticalCount: number;
    highCount: number;
    potentialMonthlyValue: number;
    lastAnalyzedAt: string;
    dataFreshness: "fresh" | "stale";
  } | null>(null);
  const [groups, setGroups] = useState<OptimizationGroup[]>([]);
  const [selected, setSelected] = useState<OptimizationOpportunity | null>(null);
  const [executionPreview, setExecutionPreview] = useState<ExecutionPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [blockedReason, setBlockedReason] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [actionsByOpportunityId, setActionsByOpportunityId] = useState<Record<string, ActionState>>({});
  const [filter, setFilter] = useState<OpportunityFilter>("active");
  const [activityLog, setActivityLog] = useState<ActionsApiItem[]>([]);
  const [showRecentChanges, setShowRecentChanges] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [appliedPulseById, setAppliedPulseById] = useState<Record<string, number>>({});
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkApplying, setBulkApplying] = useState(false);
  const undoDeadlineRef = useRef<number | null>(null);
  const undoTimeoutRef = useRef<number | null>(null);
  const [lastUndoAction, setLastUndoAction] = useState<UndoAction | null>(null);

  useEffect(() => {
    if (!shopId) return;

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);

      try {
        const cachedActions = readActionsCache(shopId);
        const cachedOpportunities = readOpportunitiesCache(shopId);
        if (cachedActions && !cancelled) {
          setActionsByOpportunityId(cachedActions);
        }
        if (cachedOpportunities && !cancelled) {
          setGroups(cachedOpportunities.groups);
          setSummary(cachedOpportunities.summary);
          setLoading(false);
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
          groups?: OptimizationGroup[];
          summary?: {
            totalOpportunities: number;
            criticalCount: number;
            highCount: number;
            potentialMonthlyValue: number;
            lastAnalyzedAt: string;
            dataFreshness: "fresh" | "stale";
          };
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

        const actionItems = Array.isArray(actionsPayload) ? actionsPayload : [];
        const hydratedActions = actionItems.reduce<
          Record<string, ActionState>
        >((acc, action) => {
          if (!action.opportunityId) return acc;
          acc[action.opportunityId] = action.action;
          return acc;
        }, {});

        if (!cancelled) {
          setSummary(opportunitiesPayload?.summary ?? null);
          setGroups(opportunitiesPayload?.groups ?? []);
          setActionsByOpportunityId(hydratedActions);
          setActivityLog(actionItems.slice(-5).reverse());
          writeActionsCache(shopId, hydratedActions);
          writeOpportunitiesCache(shopId, opportunitiesPayload?.groups ?? [], opportunitiesPayload?.summary ?? null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(toDashboardFallbackMessage(e, "Data unavailable. Try refresh."));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [shopId]);

  useEffect(() => {
    return () => {
      if (undoTimeoutRef.current) {
        window.clearTimeout(undoTimeoutRef.current);
      }
    };
  }, []);

  const opportunities = useMemo(() => groups.flatMap((group) => group.opportunities ?? []), [groups]);

  const visibleOpportunities = useMemo(() => {
    const enriched = opportunities.map((opportunity) => ({
      opportunity,
      actionState: actionsByOpportunityId[opportunity.id],
    }));

    const filtered = enriched.filter(({ actionState }) => {
      if (filter === "all") return true;
      if (filter === "active") return !actionState;
      if (filter === "critical") return !actionState;
      if (filter === "applied") return actionState === "applied";
      return actionState === "dismissed";
    });

    const scoped =
      filter === "critical"
        ? filtered.filter(({ opportunity }) => opportunity.priorityBand === "critical")
        : filtered;

    return scoped.slice(0, 4);
  }, [actionsByOpportunityId, filter, opportunities]);

  const recommendedNext = useMemo(() => {
    return opportunities
      .filter((opportunity) => !actionsByOpportunityId[opportunity.id])
      .sort((a, b) => b.priorityScore - a.priorityScore)
      .slice(0, 2);
  }, [actionsByOpportunityId, opportunities]);

  const hasOnlyCompleted = useMemo(() => {
    if (opportunities.length === 0) return false;

    return opportunities.every((opportunity) => {
      const action = actionsByOpportunityId[opportunity.id];
      return action === "applied" || action === "dismissed";
    });
  }, [actionsByOpportunityId, opportunities]);

  const resolvedStats = useMemo(() => {
    const values = Object.values(actionsByOpportunityId);
    const applied = values.filter((value) => value === "applied").length;
    const dismissed = values.filter((value) => value === "dismissed").length;
    return { applied, resolved: applied + dismissed };
  }, [actionsByOpportunityId]);

  const highConfidenceCandidates = useMemo(() => {
    return opportunities.filter((opportunity) => {
      const actionState = actionsByOpportunityId[opportunity.id];
      if (actionState) return false;
      if (opportunity.confidence < 0.85) return false;
      if (opportunity.priorityBand === "low") return false;
      return true;
    });
  }, [actionsByOpportunityId, opportunities]);

  async function applyAllHighConfidence() {
    setBulkApplying(true);
    setError(null);
    try {
      for (const opportunity of highConfidenceCandidates) {
        // sequential on purpose to preserve guardrails and avoid duplicate writes
        await applyOpportunity(opportunity);
      }
      setBulkConfirmOpen(false);
    } finally {
      setBulkApplying(false);
    }
  }

  async function dismissOpportunity(opportunity: OptimizationOpportunity) {
    setSubmittingId(opportunity.id);
    setError(null);
    try {
      const response = await fetch("/api/optimization/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opportunityId: opportunity.id,
          type: actionTypeForOpportunity(opportunity.type),
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

  async function openExecutionModal(opportunity: OptimizationOpportunity) {
    setSelected(opportunity);
    setExecutionPreview(null);
    setBlockedReason(null);
    setLoadingPreview(true);
    setError(null);
    setApplyError(null);

    try {
      const response = await fetch("/api/optimization/apply?dryRun=true", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opportunityId: opportunity.id,
          type: actionTypeForOpportunity(opportunity.type),
          payload: getApplyPayload(opportunity),
          opportunity,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { preview?: ExecutionPreview; blocked?: boolean; reason?: string; error?: string }
        | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Failed to build execution preview");
      }

      if (payload?.blocked && payload.reason) {
        setBlockedReason(payload.reason);
      }

      setExecutionPreview(payload?.preview ?? null);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to build execution preview";
      setError(message);
      toast.error(message);
    } finally {
      setLoadingPreview(false);
    }
  }

  async function undoLastApply() {
    if (!lastUndoAction) return;
    if (undoDeadlineRef.current && Date.now() > undoDeadlineRef.current) {
      toast.error("Undo window expired");
      setLastUndoAction(null);
      return;
    }

    try {
      const response = await fetch("/api/optimization/undo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lastUndoAction),
      });

      const payload = (await response.json().catch(() => null)) as { success?: boolean; error?: string } | null;
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error ?? "Undo failed");
      }

      setActionsByOpportunityId((prev) => {
        const next = { ...prev };
        delete next[lastUndoAction.opportunityId];
        if (shopId) writeActionsCache(shopId, next);
        return next;
      });
      setLastUndoAction(null);
      if (undoTimeoutRef.current) {
        window.clearTimeout(undoTimeoutRef.current);
      }
      toast.success("Change reverted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Undo failed");
    }
  }

  async function applyOpportunity(opportunity: OptimizationOpportunity): Promise<boolean> {
    setSubmittingId(opportunity.id);
    setError(null);
    setBlockedReason(null);
    setApplyError(null);

    try {
      const response = await fetch("/api/optimization/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opportunityId: opportunity.id,
          type: actionTypeForOpportunity(opportunity.type),
          payload: getApplyPayload(opportunity),
          opportunity,
          preview: executionPreview,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            success?: boolean;
            blocked?: boolean;
            reason?: string;
            type?: OptimizationActionType;
            entityId?: string | null;
            message?: string;
            impactEstimate?: number | null;
            undoAction?: UndoAction;
            error?: string;
          }
        | null;
      if (payload?.blocked) {
        const reason = payload.reason ?? "Execution blocked by safety guardrails";
        setBlockedReason(reason);
        setApplyError(reason);
        toast.error(reason);
        return false;
      }
      if (!response.ok || !payload?.success || !payload.type) {
        throw new Error(payload?.error ?? "Failed to apply opportunity");
      }

      setActionsByOpportunityId((prev) => {
        const next = { ...prev, [opportunity.id]: "applied" as const };
        if (shopId) writeActionsCache(shopId, next);
        return next;
      });
      setSelected(null);
      setExecutionPreview(null);
      setAppliedPulseById((prev) => ({ ...prev, [opportunity.id]: Date.now() }));
      window.setTimeout(() => {
        setAppliedPulseById((prev) => {
          const next = { ...prev };
          delete next[opportunity.id];
          return next;
        });
      }, 1600);

      if (payload.undoAction) {
        setLastUndoAction(payload.undoAction);
        undoDeadlineRef.current = Date.now() + 10_000;
        if (undoTimeoutRef.current) {
          window.clearTimeout(undoTimeoutRef.current);
        }
        undoTimeoutRef.current = window.setTimeout(() => {
          setLastUndoAction(null);
        }, 10_000);
      }

      const destination = toOpportunityPath(payload.type, payload.entityId ?? null);
      const actionLabel =
        payload.type === "pricing"
          ? "View menu item"
          : payload.type === "inspection"
            ? "View inspection template"
            : "View suggestion";

      toast.success("Applied successfully — Undo (10s)", {
        description:
          payload.impactEstimate && payload.impactEstimate > 0
            ? `${payload.message} · Estimated impact ${new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: "USD",
                maximumFractionDigits: 0,
              }).format(payload.impactEstimate)}`
            : payload.message,
        action: {
          label: "Undo",
          onClick: () => {
            void undoLastApply();
          },
        },
      });
      toast.message("Quick link", {
        action: {
          label: actionLabel,
          onClick: () => router.push(destination),
        },
      });
      return true;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to apply opportunity";
      setError(message);
      setApplyError(message);
      toast.error("Something went wrong", {
        description: message,
        action: selected
          ? {
              label: "Retry",
              onClick: () => {
                void applyOpportunity(opportunity);
              },
            }
          : undefined,
      });
      return false;
    } finally {
      setSubmittingId(null);
    }
  }

  async function confirmApply(opportunity: OptimizationOpportunity) {
    await applyOpportunity(opportunity);
  }

  const topOpportunity = visibleOpportunities[0]?.opportunity ?? opportunities[0] ?? null;

  if (compact) {
    return (
      <DashboardWidgetShell
        eyebrow="AI · Optimization"
        title="Optimization Opportunities"
        subtitle="Preview mode for command center."
        rightSlot={
          <Link
            href="/dashboard/owner/reports"
            className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs font-semibold text-neutral-200 transition hover:bg-black/45"
          >
            Open full view →
          </Link>
        }
        compact
      >
        {loading ? (
          <div className="text-sm text-neutral-300">Scanning pricing, inspections, and revenue patterns…</div>
        ) : error ? (
          <div className="text-sm text-[color:var(--brand-accent)]">{error}</div>
        ) : (
          <div className="space-y-2.5">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-white/10 bg-black/25 px-2.5 py-2">
                <div className="text-[10px] uppercase tracking-[0.14em] text-neutral-500">Open</div>
                <div className="mt-1 text-base font-semibold text-white">{summary?.totalOpportunities ?? opportunities.length}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/25 px-2.5 py-2">
                <div className="text-[10px] uppercase tracking-[0.14em] text-neutral-500">Critical</div>
                <div className="mt-1 text-base font-semibold text-[color:var(--brand-accent)]">{summary?.criticalCount ?? 0}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/25 px-2.5 py-2">
                <div className="text-[10px] uppercase tracking-[0.14em] text-neutral-500">Value</div>
                <div className="mt-1 text-base font-semibold text-[color:var(--brand-primary)]">
                  {summary ? formatEstimatedImpact(summary.potentialMonthlyValue).replace("Estimated impact: ", "") : "—"}
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm text-neutral-200">
              {topOpportunity ? (
                <>
                  <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">Top opportunity</div>
                  <div className="mt-1 font-semibold text-white">{topOpportunity.title}</div>
                  <div className="mt-0.5 text-xs text-neutral-400">{topOpportunity.impactLabel ?? formatEstimatedImpact(topOpportunity.estimatedValue)}</div>
                </>
              ) : (
                "No active optimization opportunities right now."
              )}
            </div>
          </div>
        )}
      </DashboardWidgetShell>
    );
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
          <div className="rounded-xl border border-[color:color-mix(in_srgb,var(--brand-primary)_25%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-primary)_10%,transparent)] px-4 py-4 text-sm text-neutral-200">
            <div className="font-semibold text-[color:var(--brand-primary)]">Your shop is optimized</div>
            <div className="mt-1 text-xs text-neutral-300">
              {resolvedStats.applied} optimizations applied · {resolvedStats.resolved} opportunities resolved
            </div>
          </div>
        ) : (
          <div className="grid gap-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setBulkConfirmOpen(true)}
                disabled={highConfidenceCandidates.length === 0 || bulkApplying}
                className="rounded-lg border border-[color:var(--brand-primary)]/50 bg-[color:color-mix(in_srgb,var(--brand-primary)_14%,transparent)] px-3 py-1.5 text-xs font-semibold text-[color:var(--brand-primary)] disabled:opacity-40"
              >
                Apply all high-confidence
              </button>
              <button
                type="button"
                onClick={() => setShowRecentChanges((prev) => !prev)}
                className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-neutral-200"
              >
                {showRecentChanges ? "Hide recent changes" : "Recent changes"}
              </button>
            </div>
            {recommendedNext.length > 0 ? (
              <div className="rounded-xl border border-[color:var(--brand-primary)]/30 bg-[color:color-mix(in_srgb,var(--brand-primary)_12%,transparent)] px-3 py-2.5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--brand-primary)]">
                  Recommended next
                </div>
                <div className="mt-1.5 space-y-1 text-xs text-neutral-200">
                  {recommendedNext.map((opportunity) => (
                    <div key={opportunity.id}>
                      • {opportunity.title} ({Math.round(opportunity.priorityScore * 100)} priority)
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {summary ? (
              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-[11px] text-neutral-300">
                {summary.totalOpportunities} opportunities · {summary.criticalCount} critical · {summary.highCount} high · Potential {formatEstimatedImpact(summary.potentialMonthlyValue).replace("Estimated impact: ", "")}
                <div className="mt-1 text-[10px] text-neutral-500">
                  Analyzed {new Date(summary.lastAnalyzedAt).toLocaleString()} · Data {summary.dataFreshness}
                </div>
              </div>
            ) : null}

            {showRecentChanges ? (
              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-neutral-300">
                <div className="font-semibold text-neutral-100">Last 5 changes</div>
                <ul className="mt-1.5 space-y-1">
                  {activityLog.length === 0 ? <li className="text-neutral-500">No actions yet.</li> : null}
                  {activityLog.map((item) => (
                    <li key={`${item.opportunityId}:${item.createdAt}`} className="flex items-center justify-between gap-2">
                      <span className="text-neutral-200">
                        {item.type} · {item.action}
                        {item.result ? ` · ${item.result}` : ""}
                      </span>
                      <span className="text-[10px] text-neutral-500">{new Date(item.createdAt).toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-1.5">
              {([
                ["active", "Active"],
                ["critical", "Critical only"],
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
              const explanation = opportunity.explanation?.operational;
              const story = opportunity.explanation?.story;

              return (
                <div
                  key={opportunity.id}
                  className={[
                    "rounded-2xl px-3 py-2.5 transition-all duration-500",
                    isApplied
                      ? "border border-emerald-500/35 bg-[color:color-mix(in_srgb,rgba(16,185,129,0.18)_55%,black)]"
                      : isDismissed
                        ? "border border-white/8 bg-black/15"
                        : "border border-white/10 bg-black/25",
                    appliedPulseById[opportunity.id] ? "scale-[1.01] shadow-[0_0_0_1px_rgba(16,185,129,0.5)] opacity-90" : "",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className={["text-[11px] uppercase tracking-[0.15em]", badgeTone(opportunity.type)].join(" ")}>
                      {typeLabel(opportunity.type)} · {Math.round(opportunity.confidence * 100)}% confidence
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={[
                          "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]",
                          priorityBadgeTone(opportunity.priorityBand),
                        ].join(" ")}
                      >
                        {opportunity.priorityBand}
                      </span>
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
                      {!isApplied && !isDismissed ? (
                        <span className="rounded-full border border-white/15 bg-black/35 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-300">
                          Pending
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
                      <div className="mt-1 text-xs text-neutral-300">{explanation?.summary ?? opportunity.summary}</div>
                      <div className="mt-2 text-[11px] text-neutral-400">Suggested action: {opportunity.suggestedAction}</div>
                      {story?.isStoryWorthy ? (
                        <div className="mt-1 inline-flex rounded-full border border-sky-300/35 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-200">
                          Ops + Story signal
                        </div>
                      ) : null}
                      {opportunity.whyNow ? (
                        <div className="mt-1 text-[11px] text-[color:var(--brand-primary)]">Why now: {opportunity.whyNow}</div>
                      ) : null}
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-neutral-400">
                        <span className="rounded-full border border-white/10 px-2 py-0.5">
                          {opportunity.confidenceLabel ?? confidenceLabel(opportunity.confidence)}
                        </span>
                        <span>{opportunity.impactLabel ?? formatEstimatedImpact(opportunity.estimatedValue)}</span>
                      </div>
                      {opportunity.relatedIds?.length ? (
                        <details className="mt-2 rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-[11px] text-neutral-300">
                          <summary className="cursor-pointer text-neutral-200">Related ({opportunity.relatedIds.length})</summary>
                          <ul className="mt-1 space-y-1 text-neutral-400">
                            {opportunity.relatedIds.slice(0, 3).map((relatedId) => (
                              <li key={relatedId}>• {relatedId}</li>
                            ))}
                          </ul>
                        </details>
                      ) : null}

                      <div className="mt-2 rounded-lg border border-white/10 bg-black/20 p-2 text-[11px] text-neutral-300">
                        <div className="font-semibold uppercase tracking-[0.12em] text-neutral-200">Why recommended</div>
                        <ul className="mt-1.5 space-y-1">
                          {whyThisMatters.slice(0, 3).map((item) => (
                            <li key={item}>• {item}</li>
                          ))}
                        </ul>
                        {explanation?.evidence?.length ? (
                          <div className="mt-2">
                            <div className="font-semibold uppercase tracking-[0.12em] text-neutral-200">What supports this</div>
                            <ul className="mt-1 space-y-1 text-neutral-400">
                              {explanation.evidence.slice(0, 3).map((evidence) => (
                                <li key={`${evidence.label}:${evidence.value ?? ""}`}>• {evidence.label}{evidence.value != null ? `: ${evidence.value}` : ""}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        {explanation?.riskIfIgnored ? (
                          <div className="mt-2 text-neutral-400">What happens if deferred: {explanation.riskIfIgnored}</div>
                        ) : null}
                      </div>
                    </>
                  ) : (
                    <div className="mt-2 text-xs text-neutral-400">Hidden from active recommendations.</div>
                  )}

                  <div className="mt-2.5 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void openExecutionModal(opportunity)}
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
                      onClick={() => void openExecutionModal(opportunity)}
                      className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-neutral-300"
                    >
                      View details
                    </button>
                  </div>
                </div>
              );
            })}

            {groups.length > 0 ? (
              <div className="grid gap-2">
                {groups.map((group) => (
                  <div key={`${group.type}:${group.groupKey}`} className="rounded-lg border border-white/10 bg-black/15 px-3 py-2">
                    <div className="text-xs font-semibold text-neutral-100">{groupLabel(group)} Optimization</div>
                    <div className="mt-1 text-[11px] text-neutral-400">
                      {group.opportunities.length} opportunities ·
                      {" "}~{formatEstimatedImpact(group.totalEstimatedValue).replace("Estimated impact: ", "")} ·
                      {" "}Avg confidence {Math.round(group.avgConfidence * 100)}%
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </DashboardWidgetShell>

      <OptimizationExecutionModal
        open={Boolean(selected)}
        opportunity={selected}
        preview={executionPreview}
        loadingPreview={loadingPreview}
        applying={selected ? submittingId === selected.id : false}
        blockedReason={blockedReason}
        applyError={applyError}
        onCancel={() => {
          setSelected(null);
          setExecutionPreview(null);
          setBlockedReason(null);
          setApplyError(null);
        }}
        onConfirm={() => {
          if (!selected) return;
          void confirmApply(selected);
        }}
        onRetry={() => {
          if (!selected) return;
          void confirmApply(selected);
        }}
      />
      {bulkConfirmOpen ? (
        <div className="fixed inset-0 z-[81] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-white/15 bg-[#101114] p-5 text-neutral-100 shadow-2xl">
            <div className="text-xs uppercase tracking-[0.16em] text-neutral-400">Batch execution</div>
            <h3 className="mt-1 text-lg font-semibold">Apply all high-confidence changes?</h3>
            <p className="mt-1 text-xs text-neutral-300">
              {highConfidenceCandidates.length} changes will run sequentially with normal guardrails.
            </p>
            <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto rounded-lg border border-white/10 bg-black/25 p-2 text-xs">
              {highConfidenceCandidates.map((opportunity) => (
                <li key={opportunity.id} className="rounded border border-white/10 bg-black/20 px-2 py-1.5">
                  <div className="font-semibold text-neutral-100">{opportunity.title}</div>
                  <div className="text-neutral-400">
                    {Math.round(opportunity.confidence * 100)}% confidence ·{" "}
                    {opportunity.impactLabel ?? formatEstimatedImpact(opportunity.estimatedValue)}
                  </div>
                </li>
              ))}
              {highConfidenceCandidates.length === 0 ? <li className="text-neutral-500">No eligible opportunities.</li> : null}
            </ul>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBulkConfirmOpen(false)}
                className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-neutral-200"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={bulkApplying || highConfidenceCandidates.length === 0}
                onClick={() => void applyAllHighConfidence()}
                className="rounded-lg bg-[color:var(--brand-primary)] px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-40"
              >
                {bulkApplying ? "Applying…" : "Apply all safe"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
