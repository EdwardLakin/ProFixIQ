"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import DashboardWidgetShell from "@/features/dashboard/components/DashboardWidgetShell";
import type { OptimizationOpportunity } from "@/features/optimization/types";

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

export default function OptimizationOpportunitiesWidget({
  shopId,
}: {
  shopId: string | null;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [opportunities, setOpportunities] = useState<OptimizationOpportunity[]>([]);

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

  return (
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

          {top.map((opportunity) => (
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
            </div>
          ))}
        </div>
      )}
    </DashboardWidgetShell>
  );
}
