import Link from "next/link";
import { AlertTriangle, ChevronRight } from "lucide-react";

import { getPerformanceDashboardPayload } from "@/features/dashboard/server/getPerformanceDashboardPayload";
import { CompactSignalList, DashboardPanel, DashboardShell, DashboardTopStrip, MetricStrip } from "./DashboardPrimitives";
import PerformanceTrendPanel, { MiniSparkline } from "./PerformanceTrendPanel";

function EmbeddedEmptyState({
  label,
  detail,
  hint,
  compact = false,
}: {
  label: string;
  detail: string;
  hint?: string;
  compact?: boolean;
}) {
  return (
    <div className={`rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] ${compact ? "px-2.5 py-2" : "px-3 py-2.5"}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">{label}</div>
      <div className="mt-1 text-xs text-[color:var(--theme-text-muted)]">{detail}</div>
      {hint ? <div className="mt-1.5 text-[11px] text-[color:var(--theme-text-muted)]">{hint}</div> : null}
    </div>
  );
}

function riskHrefForLabel(label: string): string {
  const normalized = label.toLowerCase();
  if (normalized.includes("comeback") || normalized.includes("warranty")) return "/work-orders/board?stage=comeback";
  if (normalized.includes("on-hold") || normalized.includes("on hold") || normalized.includes("blocked")) return "/work-orders/board?stage=on_hold";
  if (normalized.includes("approval")) return "/work-orders/board?stage=awaiting_approval";
  if (normalized.includes("parts")) return "/parts/requests";
  return "/dashboard/owner/reports";
}

function getSignalValue(items: Array<{ label: string; value: string }>, label: string): string {
  return items.find((item) => item.label.toLowerCase() === label.toLowerCase())?.value ?? "0";
}

function deltaText(current: number, previous: number): string {
  const delta = current - previous;
  if (previous <= 0) return delta >= 0 ? "+0%" : "0%";
  const pct = Math.round((delta / previous) * 100);
  return `${pct >= 0 ? "+" : ""}${pct}%`;
}

export default async function PerformanceDashboardView() {
  const payload = await getPerformanceDashboardPayload();
  const displayName = payload.identity.fullName?.trim() || "Operator";

  const latest = payload.trend[payload.trend.length - 1];
  const previous = payload.trend[payload.trend.length - 2];
  const marginValue = `${payload.kpis.efficiencyPct}%`;
  const onHoldRevenue = getSignalValue(payload.businessSignals, "On-hold revenue");
  const comebackRisk = getSignalValue(payload.businessSignals, "Comeback risk");

  const peakRevenueMonth = payload.trend.reduce<{ label: string; revenue: number }>(
    (best, point) => (point.revenue > best.revenue ? { label: point.label, revenue: point.revenue } : best),
    { label: "N/A", revenue: 0 },
  );

  return (
    <DashboardShell>
      <DashboardTopStrip
        view="performance"
        title="Performance Dashboard"
        name={`Executive review, ${displayName}`}
        subtitle="Business health snapshot first: revenue trajectory, margin, output, and immediate risk signals."
        actions={[
          { label: "Full reports", href: "/dashboard/owner/reports", tone: "primary" },
          { label: "Revenue detail", href: "/dashboard/owner/reports/technicians", tone: "secondary" },
        ]}
      />

      <MetricStrip
        className="mb-0"
        items={[
          {
            label: "Revenue",
            value: `$${payload.kpis.revenue.toLocaleString()}`,
            indicator: latest && previous && latest.revenue < previous.revenue ? "amber" : "accent",
          },
          {
            label: "Profit",
            value: `$${payload.kpis.profit.toLocaleString()}`,
            indicator: latest && previous && latest.profit < previous.profit ? "amber" : "accent",
          },
          { label: "Jobs", value: String(payload.kpis.jobs), indicator: "accent" },
          { label: "Efficiency", value: `${payload.kpis.efficiencyPct}%`, tone: payload.kpis.efficiencyPct < 25 ? "accent" : "default", indicator: payload.kpis.efficiencyPct < 25 ? "amber" : "accent" },
          { label: "Margin", value: marginValue },
          { label: "On-hold revenue", value: onHoldRevenue, indicator: Number(onHoldRevenue) > 0 ? "amber" : "accent", pulse: Number(onHoldRevenue) > 0 },
          { label: "Comeback risk", value: comebackRisk, indicator: Number(comebackRisk) > 0 ? "red" : "accent", pulse: Number(comebackRisk) > 0 },
          {
            label: "Rev Δ vs prior",
            value: latest && previous ? deltaText(latest.revenue, previous.revenue) : "N/A",
            tone: latest && previous && latest.revenue < previous.revenue ? "accent" : "default",
          },
        ]}
      />

      <DashboardPanel
        title="Decision rail"
        eyebrow="Immediate focus"
        className="border-amber-300/30 bg-[var(--theme-gradient-panel)] shadow-[0_0_0_1px_rgba(251,191,36,0.12)]"
        action={<Link href="/dashboard/owner/reports" className="inline-flex items-center gap-1 text-xs text-[color:var(--theme-text-secondary)] hover:text-[color:var(--theme-text-primary)]">Open reports <ChevronRight className="h-3 w-3" /></Link>}
      >
        <div className="grid gap-1.5 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
          <div className="space-y-1.5">
            {payload.optimizationSummary.map((item) => (
              <Link
                key={item.label}
                href={riskHrefForLabel(item.label)}
                className="group flex items-start justify-between gap-2 rounded-lg border px-2.5 py-1.5 transition hover:-translate-y-0.5 hover:brightness-110 hover:shadow-[var(--theme-shadow-medium)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent,#E39A6E)]/60"
                style={{
                  borderColor: item.tone === "critical" ? "rgba(248,113,113,0.58)" : item.tone === "warning" ? "rgba(251,191,36,0.46)" : "rgba(148,163,184,0.25)",
                  background: item.tone === "critical" ? "linear-gradient(120deg, rgba(127,29,29,0.48), rgba(69,10,10,0.24))" : item.tone === "warning" ? "rgba(120,53,15,0.24)" : "var(--theme-surface-inset)",
                  boxShadow: item.tone === "critical" ? "0 0 0 1px rgba(239,68,68,0.2), inset 0 1px 0 rgba(254,202,202,0.18)" : undefined,
                }}
              >
                <div>
                  <div className="text-xs font-semibold text-[color:var(--theme-text-primary)]">{item.label}</div>
                  <div className="mt-0.5 text-[11px] text-[color:var(--theme-text-primary)]">{item.detail}</div>
                </div>
                <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[color:var(--theme-text-secondary)] transition duration-200 group-hover:translate-x-1 group-hover:scale-110 group-hover:text-[var(--brand-accent,#E39A6E)]" />
              </Link>
            ))}
          </div>

          <div className="space-y-1.5">
            <DashboardPanel title="Prioritized signals" className="border-[color:var(--theme-border-soft)] bg-[var(--theme-gradient-panel)] p-2.5 md:p-2.5">
              {payload.businessSignals.length > 0 ? (
                <CompactSignalList items={payload.businessSignals.slice(0, 5)} />
              ) : (
                <EmbeddedEmptyState compact label="Signal activation pending" detail="No active risk/opportunity signals — verify new jobs are entering billing flow." />
              )}
            </DashboardPanel>
          </div>
        </div>
      </DashboardPanel>

      <div
        className="space-y-1.5 rounded-[22px] border border-[color:var(--theme-border-soft)] p-2.5 md:p-2.5"
        style={{
          background: "var(--theme-gradient-panel)",
          boxShadow: "var(--theme-shadow-medium)",
        }}
      >
        <section className="grid gap-1.5 xl:grid-cols-[minmax(0,1.85fr)_minmax(252px,0.92fr)]">
          <DashboardPanel
            title="Executive trend"
            className="border-[color:var(--theme-border-soft)] bg-[var(--theme-gradient-panel)]"
            action={
              <div className="text-right text-[11px] text-[color:var(--theme-text-secondary)]">
                <div>Peak month: {peakRevenueMonth.label}</div>
                <div className="text-[color:var(--theme-text-secondary)]">${peakRevenueMonth.revenue.toLocaleString()}</div>
              </div>
            }
          >
            <div className="grid gap-1.5">
              <PerformanceTrendPanel data={payload.trend} />
              <div className="grid gap-1 sm:grid-cols-3">
                <div className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2.5 py-1.5">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">Revenue pace</div>
                  <div className="mt-0.5 text-base font-semibold text-[color:var(--theme-text-primary)]">{latest && previous ? deltaText(latest.revenue, previous.revenue) : "N/A"}</div>
                  <div className="text-[10px] text-[color:var(--theme-text-secondary)]">vs prior month</div>
                </div>
                <div className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2.5 py-1.5">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">Profit pace</div>
                  <div className="mt-0.5 text-base font-semibold text-[color:var(--theme-text-primary)]">{latest && previous ? deltaText(latest.profit, previous.profit) : "N/A"}</div>
                  <div className="text-[10px] text-[color:var(--theme-text-secondary)]">trend right now</div>
                </div>
                <div className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2.5 py-1.5">
                  {payload.revenueWatch.length > 0 ? (
                    <>
                      <CompactSignalList items={payload.revenueWatch.slice(0, 2)} />
                      <MiniSparkline data={payload.trend} dataKey="revenue" />
                    </>
                  ) : (
                    <EmbeddedEmptyState compact label="Revenue watch idle" detail="Monthly comparisons activate as periods close." />
                  )}
                </div>
              </div>
            </div>
          </DashboardPanel>

          <DashboardPanel title="Performance signals" className="border-[color:var(--theme-border-soft)] bg-[var(--theme-gradient-panel)]">
            <div className="space-y-1.5">
              <div className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2.5 py-1.5">
                <div className="text-[10px] uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">Revenue pace</div>
                <div className="mt-0.5 text-base font-semibold text-[color:var(--theme-text-primary)]">{latest && previous ? deltaText(latest.revenue, previous.revenue) : "N/A"}</div>
              </div>
              <div className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2.5 py-1.5">
                <div className="text-[10px] uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">Profit pace</div>
                <div className="mt-0.5 text-base font-semibold text-[color:var(--theme-text-primary)]">{latest && previous ? deltaText(latest.profit, previous.profit) : "N/A"}</div>
              </div>
              {payload.revenueWatch.length > 0 ? (
                <CompactSignalList items={payload.revenueWatch} />
              ) : (
                <EmbeddedEmptyState compact label="Pace signal pending" detail="No pace signal yet — close jobs to refresh revenue cadence." />
              )}
            </div>
          </DashboardPanel>
        </section>

        <section className="grid gap-1.5 lg:grid-cols-2">
          <DashboardPanel title="Technician output" className="border-[color:var(--theme-border-soft)] bg-[var(--theme-gradient-panel)]">
            {payload.technicianPerformance.some((tech) => tech.completed > 0) ? (
              <div className="grid gap-1">
                {payload.technicianPerformance.slice(0, 4).map((tech) => (
                  <div key={tech.label} className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2.5 py-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-[color:var(--theme-text-primary)]">{tech.label}</span>
                      <span className="text-[color:var(--theme-text-secondary)]">{tech.completed} jobs</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[color:var(--theme-surface-subtle)]">
                      <div className="h-full bg-[var(--brand-accent,#E39A6E)]" style={{ width: `${tech.utilizationPct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmbeddedEmptyState
                compact
                label="Throughput blocked"
                detail="No active technician output — jobs not flowing."
                hint="Move work orders into active technician stages."
              />
            )}
          </DashboardPanel>

          <DashboardPanel
            title="Business risk & opportunity"
            className="border-[color:var(--theme-border-soft)] bg-[var(--theme-gradient-panel)]"
            action={<Link href="/dashboard/operations" className="inline-flex items-center gap-1 text-xs text-[color:var(--theme-text-secondary)] hover:text-[color:var(--theme-text-primary)]">Operations view <ChevronRight className="h-3 w-3" /></Link>}
          >
            {payload.businessSignals.length > 0 ? (
              <>
                <CompactSignalList items={payload.businessSignals} />
                <MiniSparkline data={payload.trend} dataKey="profit" />
              </>
            ) : (
              <EmbeddedEmptyState compact label="Risk feed inactive" detail="No live risk/opportunity triggers — validate approvals, parts, and comeback queues." />
            )}
          </DashboardPanel>
        </section>
      </div>

      {payload.sectionErrors.length > 0 ? (
        <DashboardPanel eyebrow="Diagnostics" title="Section warnings">
          <div className="space-y-1.5 text-xs text-amber-300">
            {payload.sectionErrors.map((warning) => (
              <div key={warning} className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5" />
                <span>{warning}</span>
              </div>
            ))}
          </div>
        </DashboardPanel>
      ) : null}
    </DashboardShell>
  );
}
