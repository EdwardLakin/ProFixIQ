"use client";

import DashboardWidgetShell from "@/features/dashboard/components/DashboardWidgetShell";
import { useTechnicianLoadMetrics } from "@/features/dashboard/hooks/useTechnicianLoadMetrics";

function utilizationBand(pct: number): "high" | "balanced" | "low" {
  if (pct >= 85) return "high";
  if (pct >= 55) return "balanced";
  return "low";
}

export default function LiveShopLoadWidget({ shopId }: { shopId: string | null }) {
  const { metrics, loading, error } = useTechnicianLoadMetrics(shopId, {
    enabled: true,
    pollMs: 30_000,
  });

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
        <div className="flex h-full min-h-0 flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Active jobs now" value={String(summary.totalActiveJobs)} />
            <Stat
              label="Active techs / Capacity"
              value={`${summary.activeTechnicians}/${summary.totalTechnicians}`}
              tone="accent"
            />
            <Stat label="Shop utilization" value={`${summary.shopUtilizationPct}%`} tone="secondary" />
          </div>

          <div className="rounded-xl border border-white/10 bg-[color:color-mix(in_srgb,black_72%,transparent)] px-4 py-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">Live utilization signal</div>
                <div className="mt-1 text-xs font-medium text-neutral-300">{stateLabel}</div>
              </div>
              <div className="text-right">
                <div className="text-3xl font-semibold leading-none text-white">{utilization}%</div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-neutral-500">
                  {metrics?.timezone ?? "UTC"}
                </div>
              </div>
            </div>

            <div className="mt-4 h-4 overflow-hidden rounded-full border border-white/10 bg-black/45 p-[2px]">
              <div className="h-full rounded-full bg-white/5">
                <div className={["h-full rounded-full shadow-[0_0_20px_color-mix(in_srgb,var(--brand-primary)_30%,transparent)] transition-all", barClass].join(" ")} style={{ width }} />
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 text-[10px] text-neutral-500">
              <span>0%</span>
              <span className="text-center">Target 55–85%</span>
              <span className="text-right">100%</span>
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
    <div className="flex min-h-[74px] flex-col justify-between rounded-xl border border-white/10 bg-black/25 px-3 py-3">
      <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">{label}</div>
      <div className={["mt-1 text-xl font-semibold leading-tight", toneClass].join(" ")}>{value}</div>
    </div>
  );
}
