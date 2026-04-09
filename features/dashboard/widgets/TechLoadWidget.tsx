"use client";

import { useEffect, useMemo, useState } from "react";
import DashboardWidgetShell from "@/features/dashboard/components/DashboardWidgetShell";
import {
  getTechnicianLoadMetrics,
  type TechnicianLoadMetricRow,
} from "@shared/lib/stats/getTechnicianLoadMetrics";
import { cn } from "@shared/lib/utils";

function toHoursLabel(seconds: number): string {
  return `${(seconds / 3600).toFixed(1)}h`;
}

function utilizationTone(utilizationPct: number): "high" | "balanced" | "low" {
  if (utilizationPct >= 85) return "high";
  if (utilizationPct >= 55) return "balanced";
  return "low";
}

function toneClasses(tone: "high" | "balanced" | "low"): { pill: string; bar: string; rail: string } {
  if (tone === "high") {
    return {
      pill:
        "border-[color:color-mix(in_srgb,var(--brand-accent)_45%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-accent)_15%,transparent)] text-[color:var(--brand-accent)]",
      bar: "bg-[color:var(--brand-accent)]",
      rail: "bg-[color:color-mix(in_srgb,var(--brand-accent)_16%,transparent)]",
    };
  }
  if (tone === "balanced") {
    return {
      pill:
        "border-[color:color-mix(in_srgb,var(--brand-primary)_45%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-primary)_16%,transparent)] text-[color:var(--brand-primary)]",
      bar: "bg-[color:var(--brand-primary)]",
      rail: "bg-[color:color-mix(in_srgb,var(--brand-primary)_16%,transparent)]",
    };
  }

  return {
    pill:
      "border-white/15 bg-white/5 text-[color:var(--theme-text-secondary)]",
    bar: "bg-[color:var(--theme-text-secondary)]",
    rail: "bg-white/10",
  };
}

export default function TechLoadWidget({ shopId }: { shopId: string | null }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<TechnicianLoadMetricRow[]>([]);
  const [timezone, setTimezone] = useState("UTC");

  useEffect(() => {
    if (!shopId) return;

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await getTechnicianLoadMetrics(shopId);
        if (!cancelled) {
          setRows(result.rows ?? []);
          setTimezone(result.timezone);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load technician load.");
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

  const currentlyBusy = rows.filter((row) => row.currentActiveJobs > 0).length;
  const overloaded = rows.filter((row) => row.utilizationPct >= 85).length;

  const summary = useMemo(() => {
    const totalShift = rows.reduce((sum, row) => sum + row.shiftSecondsToday, 0);
    const totalActive = rows.reduce((sum, row) => sum + row.activeSecondsToday, 0);
    const pct = totalShift > 0 ? Math.round((Math.min(totalActive, totalShift) / totalShift) * 100) : 0;

    return {
      pct,
      railWidth: `${Math.max(0, Math.min(100, pct))}%`,
    };
  }, [rows]);

  return (
    <DashboardWidgetShell
      eyebrow="AI · Technician Load"
      title="Technician Load"
      subtitle="Today in shop timezone: utilization, active jobs, and active vs idle balance."
      compact
    >
      {loading ? (
        <div className="text-sm text-neutral-300">Loading technician load…</div>
      ) : error ? (
        <div className="rounded-xl border border-[color:color-mix(in_srgb,var(--brand-accent)_45%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-accent)_14%,transparent)] px-3 py-3 text-sm text-[color:var(--brand-accent)]">
          {error}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-sm text-neutral-400">
          No technician load data found for today.
        </div>
      ) : (
        <div className="flex h-full min-h-0 flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric label="Techs tracked" value={String(rows.length)} />
            <Metric label="Currently busy" value={String(currentlyBusy)} tone="accent" />
            <Metric label="High utilization (85%+)" value={String(overloaded)} tone="secondary" />
          </div>

          <div className="rounded-xl border border-white/10 bg-[color:color-mix(in_srgb,black_72%,transparent)] px-4 py-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">Team utilization</div>
                <div className="mt-1 text-xs font-medium text-neutral-300">Active line punches vs total shift time</div>
              </div>
              <div className="text-right">
                <div className="text-3xl font-semibold leading-none text-white">{summary.pct}%</div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-neutral-500">{timezone}</div>
              </div>
            </div>
            <div className="mt-4 h-4 overflow-hidden rounded-full border border-white/10 bg-black/45 p-[2px]">
              <div
                className="h-full rounded-full bg-[color:var(--brand-primary)] shadow-[0_0_20px_color-mix(in_srgb,var(--brand-primary)_35%,transparent)] transition-all"
                style={{ width: summary.railWidth }}
              />
            </div>
            <div className="mt-3 grid grid-cols-3 text-[10px] text-neutral-500">
              <span>0%</span>
              <span className="text-center">Target 55–85%</span>
              <span className="text-right">100%</span>
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {rows.slice(0, 6).map((row, index) => {
              const tone = utilizationTone(row.utilizationPct);
              const colors = toneClasses(tone);

              return (
                <div key={row.techId} className="rounded-xl border border-white/10 bg-black/25 px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[10px] font-semibold text-neutral-300">
                        {index + 1}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-white">{row.name}</div>
                        <div className="mt-1 text-xs text-neutral-400">
                          {row.currentActiveJobs} active job{row.currentActiveJobs === 1 ? "" : "s"} ·
                          {" "}
                          Active {toHoursLabel(row.activeSecondsToday)}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={cn("inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold", colors.pill)}>
                        {row.utilizationPct}%
                      </div>
                      <div className="mt-1 text-[10px] text-neutral-500">
                        Active {toHoursLabel(row.activeSecondsToday)} · Idle {toHoursLabel(row.idleBreakdown.availableIdleSeconds)}
                      </div>
                    </div>
                  </div>

                  <div className={cn("mt-2.5 h-2 overflow-hidden rounded-full", colors.rail)}>
                    <div
                      className={cn("h-full rounded-full transition-all", colors.bar)}
                      style={{ width: `${Math.max(0, Math.min(100, row.utilizationPct))}%` }}
                    />
                  </div>
                </div>
              );
            })}
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
    <div className="flex min-h-[74px] flex-col justify-between rounded-xl border border-white/10 bg-black/25 px-3 py-3">
      <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">{label}</div>
      <div className={["mt-1 text-xl font-semibold leading-tight", toneClass].join(" ")}>{value}</div>
    </div>
  );
}
