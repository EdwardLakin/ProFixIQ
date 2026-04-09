"use client";

import { useEffect, useState } from "react";
import DashboardWidgetShell from "@/features/dashboard/components/DashboardWidgetShell";
import {
  getTechnicianLoadMetrics,
  type TechnicianLoadMetricRow,
} from "@shared/lib/stats/getTechnicianLoadMetrics";

function durationLabel(seconds: number): string {
  const mins = Math.round(seconds / 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export default function TechnicianPerformanceWidget({ shopId }: { shopId: string | null }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<TechnicianLoadMetricRow[]>([]);

  useEffect(() => {
    if (!shopId) return;

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await getTechnicianLoadMetrics(shopId);
        if (!cancelled) {
          const sorted = [...(result.rows ?? [])].sort(
            (a, b) => b.completedJobsToday - a.completedJobsToday,
          );
          setRows(sorted);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load technician performance.");
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [shopId]);

  const completedTotal = rows.reduce((sum, row) => sum + row.completedJobsToday, 0);
  const avgDurationAcrossTeam =
    rows.length > 0
      ? Math.round(
          rows.reduce((sum, row) => sum + row.avgJobDurationSeconds, 0) / Math.max(1, rows.length),
        )
      : 0;

  return (
    <DashboardWidgetShell
      eyebrow="AI · Technician Performance"
      title="Technician Performance"
      subtitle="Jobs completed and average punch duration today."
      compact
    >
      {loading ? (
        <div className="text-sm text-neutral-300">Loading technician performance…</div>
      ) : error ? (
        <div className="rounded-xl border border-[color:color-mix(in_srgb,var(--brand-accent)_45%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-accent)_14%,transparent)] px-3 py-3 text-sm text-[color:var(--brand-accent)]">
          {error}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-sm text-neutral-400">
          No technician performance data found for today.
        </div>
      ) : (
        <div className="flex h-full min-h-0 flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric label="Completed jobs" value={String(completedTotal)} />
            <Metric label="Team avg duration" value={durationLabel(avgDurationAcrossTeam)} tone="accent" />
            <Metric
              label="Techs with active work"
              value={String(rows.filter((row) => row.currentActiveJobs > 0).length)}
              tone="secondary"
            />
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {rows.slice(0, 5).map((row) => (
              <div key={row.techId} className="rounded-xl border border-white/10 bg-black/25 px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white">{row.name}</div>
                    <div className="mt-1 text-xs text-neutral-400">
                      {row.completedJobsToday} completed · Avg {durationLabel(row.avgJobDurationSeconds)}
                    </div>
                  </div>

                  <span className="rounded-full border border-[color:color-mix(in_srgb,var(--brand-accent)_45%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-accent)_14%,transparent)] px-2 py-0.5 text-[10px] font-semibold text-[color:var(--brand-accent)]">
                    {row.utilizationPct}% active
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </DashboardWidgetShell>
  );
}

function Metric({
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
        ? "text-[color:var(--theme-text-secondary)]"
        : "text-[color:var(--brand-primary)]";

  return (
    <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-3">
      <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">{label}</div>
      <div className={["mt-1 text-lg font-semibold", toneClass].join(" ")}>{value}</div>
    </div>
  );
}
