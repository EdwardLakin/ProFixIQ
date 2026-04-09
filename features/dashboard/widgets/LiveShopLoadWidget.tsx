"use client";

import { useEffect, useState } from "react";
import DashboardWidgetShell from "@/features/dashboard/components/DashboardWidgetShell";
import {
  getTechnicianLoadMetrics,
  type TechnicianLoadMetricResult,
} from "@shared/lib/stats/getTechnicianLoadMetrics";

function utilizationBand(pct: number): "high" | "balanced" | "low" {
  if (pct >= 85) return "high";
  if (pct >= 55) return "balanced";
  return "low";
}

export default function LiveShopLoadWidget({ shopId }: { shopId: string | null }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<TechnicianLoadMetricResult | null>(null);

  useEffect(() => {
    if (!shopId) return;

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await getTechnicianLoadMetrics(shopId);
        if (!cancelled) setMetrics(result);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load live shop load.");
          setMetrics(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [shopId]);

  const summary = metrics?.summary;
  const utilization = summary?.shopUtilizationPct ?? 0;
  const width = `${Math.max(0, Math.min(100, utilization))}%`;
  const band = utilizationBand(utilization);

  const barClass =
    band === "high"
      ? "bg-[color:var(--brand-accent)]"
      : band === "balanced"
        ? "bg-[color:var(--brand-primary)]"
        : "bg-[color:var(--theme-text-secondary)]";

  const stateLabel = band === "high" ? "Hot load" : band === "balanced" ? "Balanced" : "Under capacity";

  return (
    <DashboardWidgetShell
      eyebrow="Live Ops"
      title="Live Shop Load"
      subtitle="Real-time capacity signal from technician active work and shift coverage."
      compact
    >
      {loading ? (
        <div className="text-sm text-neutral-300">Loading live shop load…</div>
      ) : error ? (
        <div className="rounded-xl border border-[color:color-mix(in_srgb,var(--brand-accent)_45%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-accent)_14%,transparent)] px-3 py-3 text-sm text-[color:var(--brand-accent)]">
          {error}
        </div>
      ) : !summary ? (
        <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-sm text-neutral-400">
          No live load data available right now.
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Active jobs now" value={String(summary.totalActiveJobs)} />
            <Stat label="Active techs / Capacity" value={`${summary.activeTechnicians}/${summary.totalTechnicians}`} tone="accent" />
            <Stat label="Shop utilization" value={`${summary.shopUtilizationPct}%`} tone="secondary" />
          </div>

          <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">Load bar</div>
              <div className="text-xs font-semibold text-white">{stateLabel}</div>
            </div>

            <div className="mt-2 h-3 overflow-hidden rounded-full bg-white/10">
              <div className={[
                "h-full rounded-full transition-all",
                barClass,
              ].join(" ")} style={{ width }} />
            </div>

            <div className="mt-2 flex items-center justify-between text-[10px] text-neutral-500">
              <span>0%</span>
              <span>{utilization}% utilization · {metrics?.timezone ?? "UTC"}</span>
              <span>100%</span>
            </div>
          </div>
        </div>
      )}
    </DashboardWidgetShell>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "accent" | "secondary";
}) {
  const toneClass =
    tone === "accent"
      ? "text-[color:var(--brand-accent)]"
      : tone === "secondary"
        ? "text-[color:var(--brand-primary)]"
        : "text-neutral-100";

  return (
    <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-3">
      <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">{label}</div>
      <div className={["mt-1 text-lg font-semibold", toneClass].join(" ")}>{value}</div>
    </div>
  );
}
