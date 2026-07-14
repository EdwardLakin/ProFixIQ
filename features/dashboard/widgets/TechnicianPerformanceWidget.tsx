"use client";

import DashboardWidgetShell from "@/features/dashboard/components/DashboardWidgetShell";
import { useTechnicianLoadMetrics } from "@/features/dashboard/hooks/useTechnicianLoadMetrics";
import type { TechnicianLoadMetricRow } from "@shared/lib/stats/getTechnicianLoadMetrics";

function durationLabel(seconds: number): string {
  const mins = Math.round(seconds / 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function signedDurationLabel(seconds: number): string {
  if (seconds === 0) return "On target";
  return `${seconds > 0 ? "+" : "-"}${durationLabel(Math.abs(seconds))}`;
}

export default function TechnicianPerformanceWidget({
  shopId,
  compact = false,
}: {
  shopId: string | null;
  compact?: boolean;
}) {
  const { metrics, loading, error } = useTechnicianLoadMetrics(shopId, {
    enabled: true,
    pollMs: 30_000,
  });

  const rows: TechnicianLoadMetricRow[] = [...(metrics?.rows ?? [])].sort(
    (a, b) => b.completedJobsToday - a.completedJobsToday,
  );

  const completedTotal = rows.reduce((sum, row) => sum + row.completedJobsToday, 0);
  const avgDurationAcrossTeam =
    rows.length > 0
      ? Math.round(
          rows.reduce((sum, row) => sum + row.avgJobDurationSeconds, 0) / Math.max(1, rows.length),
        )
      : 0;
  const defensibleRows = rows.filter((row) => row.expectedActualSummary.efficiencySignalDefensible);
  const pairedJobsTotal = rows.reduce(
    (sum, row) => sum + row.expectedActualSummary.pairedJobs,
    0,
  );
  const topTech = rows[0] ?? null;

  if (compact) {
    return (
      <DashboardWidgetShell
        eyebrow="AI · Technician Performance"
        title="Technician Performance"
        subtitle="Compact productivity preview."
        compact
      >
        {loading ? (
          <div className="text-sm text-[color:var(--theme-text-secondary)]">Loading technician performance…</div>
        ) : error ? (
          <div className="text-sm text-[color:var(--brand-accent)]">{error}</div>
        ) : !topTech ? (
          <div className="text-sm text-[color:var(--theme-text-secondary)]">No technician performance data found for today.</div>
        ) : (
          <div className="space-y-2.5">
            <div className="grid grid-cols-3 gap-2">
              <Metric label="Completed" value={String(completedTotal)} />
              <Metric label="Avg duration" value={durationLabel(avgDurationAcrossTeam)} tone="accent" />
              <Metric label="Paired jobs" value={String(pairedJobsTotal)} tone="secondary" />
            </div>
            <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2.5 text-sm text-[color:var(--theme-text-primary)]">
              Top performer: <span className="font-semibold text-[color:var(--theme-text-primary)]">{topTech.name}</span> ·{" "}
              {topTech.completedJobsToday} jobs · {topTech.utilizationPct}% active
            </div>
          </div>
        )}
      </DashboardWidgetShell>
    );
  }

  return (
    <DashboardWidgetShell
      eyebrow="AI · Technician Performance"
      title="Technician Performance"
      subtitle="Jobs completed and average punch duration today."
      compact
    >
      {loading ? (
        <div className="text-sm text-[color:var(--theme-text-secondary)]">Loading technician performance…</div>
      ) : error ? (
        <div className="rounded-xl border border-[color:color-mix(in_srgb,var(--brand-accent)_45%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-accent)_14%,transparent)] px-3 py-3 text-sm text-[color:var(--brand-accent)]">
          {error}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-3 text-sm text-[color:var(--theme-text-secondary)]">
          No technician performance data found for today.
        </div>
      ) : (
        <div className="flex h-full min-h-0 flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric label="Completed jobs" value={String(completedTotal)} />
            <Metric label="Team avg duration" value={durationLabel(avgDurationAcrossTeam)} tone="accent" />
            <Metric
              label="Expected vs active jobs"
              value={String(pairedJobsTotal)}
              tone="secondary"
            />
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {rows.slice(0, 5).map((row) => (
              <div key={row.techId} className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[color:var(--theme-text-primary)]">{row.name}</div>
                    <div className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                      {row.completedJobsToday} completed · Avg {durationLabel(row.avgJobDurationSeconds)}
                    </div>
                    {row.expectedActualSummary.pairedJobs > 0 ? (
                      <div className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                        Expected {durationLabel(row.expectedActualSummary.expectedSecondsTotal)} · Active{" "}
                        {durationLabel(row.expectedActualSummary.actualActiveSecondsTotal)} (
                        {signedDurationLabel(row.expectedActualSummary.varianceSecondsTotal)})
                      </div>
                    ) : null}
                  </div>

                  <span className="rounded-full border border-[color:color-mix(in_srgb,var(--brand-accent)_45%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-accent)_14%,transparent)] px-2 py-0.5 text-[10px] font-semibold text-[color:var(--brand-accent)]">
                    {row.utilizationPct}% active
                  </span>
                </div>
                {row.expectedActualSummary.efficiencySignalDefensible &&
                row.expectedActualSummary.efficiencySignalPct !== null ? (
                  <div className="mt-2 text-[11px] text-[color:var(--theme-text-secondary)]">
                    Efficiency signal: {row.expectedActualSummary.efficiencySignalPct.toFixed(1)}% based
                    on {row.expectedActualSummary.pairedJobs} paired jobs.
                  </div>
                ) : row.expectedActualSummary.pairedJobs > 0 ? (
                  <div className="mt-2 text-[11px] text-[color:var(--theme-text-muted)]">
                    Efficiency signal withheld until expected-vs-active coverage is stronger.
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          {defensibleRows.length === 0 ? (
            <div className="text-[11px] text-[color:var(--theme-text-muted)]">
              Expected-vs-actual efficiency is only shown when enough paired completed jobs are available.
            </div>
          ) : null}
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
    <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-3">
      <div className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">{label}</div>
      <div className={["mt-1 text-lg font-semibold", toneClass].join(" ")}>{value}</div>
    </div>
  );
}
