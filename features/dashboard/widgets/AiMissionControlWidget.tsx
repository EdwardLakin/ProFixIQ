"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardWidgetShell from "@/features/dashboard/components/DashboardWidgetShell";
import { toDashboardFallbackMessage } from "@/features/dashboard/lib/widget-fallback";

type RecommendationItem = {
  id: string;
  domain: "work_orders" | "shop_boost";
  domainLabel: "Work order" | "Shop Boost";
  title: string;
  summary: string | null;
  status: "open" | "acknowledged";
  priority: "low" | "normal" | "high" | "urgent";
  riskTier: "low" | "medium" | "high" | "critical";
  confidence: number | null;
  recommendedActionLabel: string | null;
  href: string | null;
  previewCount: number;
};

type MissionControlSummary = {
  totalOpen: number;
  totalAcknowledged: number;
  urgentCount: number;
  highCount: number;
  mediumRiskCount: number;
  highRiskCount: number;
  staleCount: number;
  missingDataCount: number;
  workOrdersNeedingAttention: number;
  totalPreviewCount: number;
  recommendations: RecommendationItem[];
  generatedAt: string;
};

function priorityClass(priority: RecommendationItem["priority"]): string {
  if (priority === "urgent") return "border-red-400/40 bg-red-500/20 text-red-100";
  if (priority === "high") return "border-orange-400/40 bg-orange-500/20 text-orange-100";
  if (priority === "normal") return "border-yellow-400/35 bg-yellow-500/15 text-yellow-100";
  return "border-white/15 bg-black/35 text-neutral-300";
}

function riskClass(riskTier: RecommendationItem["riskTier"]): string {
  if (riskTier === "critical") return "border-red-400/45 text-red-200";
  if (riskTier === "high") return "border-orange-400/45 text-orange-200";
  if (riskTier === "medium") return "border-yellow-400/40 text-yellow-200";
  return "border-white/20 text-neutral-300";
}

function statusLabel(status: RecommendationItem["status"]): string {
  return status === "acknowledged" ? "Acknowledged" : "Open";
}

function confidenceLabel(confidence: number | null): string {
  if (typeof confidence !== "number" || !Number.isFinite(confidence)) return "Confidence —";
  return `Confidence ${Math.round(confidence * 100)}%`;
}

export default function AiMissionControlWidget() {
  const [summary, setSummary] = useState<MissionControlSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/dashboard/ai-mission-control", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as { summary?: MissionControlSummary; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to load AI mission control summary.");
      setSummary(json.summary ?? null);
    } catch (e) {
      setError(toDashboardFallbackMessage(e, "AI mission control is unavailable right now."));
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const topRecommendations = useMemo(() => summary?.recommendations?.slice(0, 5) ?? [], [summary]);

  return (
    <DashboardWidgetShell
      eyebrow="Operational intelligence"
      title="AI Mission Control"
      subtitle="Evidence-backed recommendations from active shop work."
      compact
      rightSlot={
        <div className="flex items-center gap-2">
          <Link href="/dashboard/ai-recommendations" className="rounded-full border border-cyan-400/35 bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold text-cyan-100 transition hover:bg-cyan-500/20">
            View all
          </Link>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-[11px] font-semibold text-neutral-200 transition hover:bg-black/40"
          >
            Refresh
          </button>
        </div>
      }
    >
      {loading ? (
        <div className="space-y-2">
          <div className="h-10 animate-pulse rounded-xl border border-white/10 bg-black/25" />
          <div className="h-10 animate-pulse rounded-xl border border-white/10 bg-black/25" />
          <div className="h-10 animate-pulse rounded-xl border border-white/10 bg-black/25" />
        </div>
      ) : error ? (
        <div className="space-y-2 rounded-xl border border-[color:color-mix(in_srgb,var(--brand-accent)_45%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-accent)_14%,transparent)] px-3 py-3 text-sm text-[color:var(--brand-accent)]">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-full border border-white/20 bg-black/30 px-2.5 py-1 text-xs text-neutral-100"
          >
            Retry
          </button>
        </div>
      ) : !summary || topRecommendations.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-sm text-neutral-300">
          No active operational recommendations yet. Generate recommendations from a work order to populate this view.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
            <Metric label="Active" value={String(summary.totalOpen)} />
            <Metric label="Urgent + high" value={String(summary.urgentCount + summary.highCount)} />
            <Metric label="Acknowledged" value={String(summary.totalAcknowledged)} />
            <Metric label="Missing data" value={String(summary.missingDataCount)} />
            <Metric label="Stale" value={String(summary.staleCount)} />
            <Metric label="Preview-ready" value={String(summary.totalPreviewCount)} />
          </div>

          <div className="space-y-2">
            {topRecommendations.map((item) => (
              <div key={item.id} className="rounded-xl border border-white/10 bg-black/25 px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${priorityClass(item.priority)}`}>
                    {item.priority}
                  </span>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase ${riskClass(item.riskTier)}`}>
                    {item.riskTier} risk
                  </span>
                  <span className="rounded-full border border-cyan-400/30 px-2 py-0.5 text-[10px] uppercase text-cyan-100">
                    {item.domainLabel}
                  </span>
                  <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] uppercase text-neutral-300">
                    {statusLabel(item.status)}
                  </span>
                </div>
                <p className="mt-1.5 text-sm font-semibold text-neutral-100">{item.title}</p>
                <p className="mt-1 text-[11px] text-neutral-400">{item.recommendedActionLabel ?? "Review recommendation details"}</p>
                <div className="mt-1.5 flex items-center justify-between text-[11px] text-neutral-400">
                  <span>{confidenceLabel(item.confidence)}</span>
                  {item.href ? (
                    <Link href={item.href} className="text-[var(--brand-primary)] transition hover:opacity-80">
                      {item.domain === "shop_boost" ? "Open Shop Boost review →" : "View work order →"}
                    </Link>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </DashboardWidgetShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/30 px-2.5 py-2">
      <p className="text-[10px] uppercase tracking-[0.14em] text-neutral-500">{label}</p>
      <p className="mt-1 text-base font-semibold text-neutral-100">{value}</p>
    </div>
  );
}
