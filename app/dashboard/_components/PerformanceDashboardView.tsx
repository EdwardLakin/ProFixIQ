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
    <div className={`rounded-lg border border-white/5 bg-black/15 ${compact ? "px-2.5 py-2" : "px-3 py-2.5"}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">{label}</div>
      <div className="mt-1 text-xs text-neutral-500">{detail}</div>
      {hint ? <div className="mt-1.5 text-[11px] text-neutral-500">{hint}</div> : null}
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
        className="mb-0.5"
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

      <div
        className="grid gap-2 rounded-[22px] border border-white/5 p-2.5 md:p-3 xl:grid-cols-[minmax(0,2.2fr)_minmax(320px,0.95fr)]"
        style={{
          background: "linear-gradient(158deg, rgba(4,8,20,0.92), rgba(8,14,30,0.78) 48%, rgba(4,10,24,0.86))",
          boxShadow: "inset 0 1px 0 rgba(148,163,184,0.06), 0 16px 28px rgba(0,0,0,0.24)",
        }}
      >
        <section className="space-y-2">
          <DashboardPanel
            title="Executive trend"
            className="border-white/5 bg-[linear-gradient(155deg,rgba(7,13,28,0.9),rgba(8,14,30,0.78))]"
            action={
              <div className="text-right text-[11px] text-neutral-400">
                <div>Peak month: {peakRevenueMonth.label}</div>
                <div className="text-neutral-300">${peakRevenueMonth.revenue.toLocaleString()}</div>
              </div>
            }
          >
            <div className="grid gap-2 xl:grid-cols-[minmax(0,1.65fr)_minmax(220px,0.9fr)]">
              <PerformanceTrendPanel data={payload.trend} />
              <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-1">
                <div className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-2">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-neutral-400">Revenue pace</div>
                  <div className="mt-1 text-lg font-semibold text-white">{latest && previous ? deltaText(latest.revenue, previous.revenue) : "N/A"}</div>
                  <div className="text-[11px] text-neutral-400">vs previous month</div>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-2">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-neutral-400">Profit pace</div>
                  <div className="mt-1 text-lg font-semibold text-white">{latest && previous ? deltaText(latest.profit, previous.profit) : "N/A"}</div>
                  <div className="text-[11px] text-neutral-400">current month trend</div>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-2 sm:col-span-2 xl:col-span-1">
                  {payload.revenueWatch.length > 0 ? (
                    <>
                      <CompactSignalList items={payload.revenueWatch} />
                      <MiniSparkline data={payload.trend} dataKey="revenue" />
                    </>
                  ) : (
                    <EmbeddedEmptyState compact label="Revenue watch idle" detail="Monthly comparisons populate as billing periods close." />
                  )}
                </div>
              </div>
            </div>
          </DashboardPanel>

          <div className="grid gap-2 lg:grid-cols-2">
            <DashboardPanel title="Technician output" className="border-white/5 bg-[linear-gradient(155deg,rgba(7,12,25,0.84),rgba(8,14,29,0.74))]">
              {payload.technicianPerformance.some((tech) => tech.completed > 0) ? (
                <div className="grid gap-1.5">
                  {payload.technicianPerformance.slice(0, 4).map((tech) => (
                    <div key={tech.label} className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-white">{tech.label}</span>
                        <span className="text-neutral-300">{tech.completed} jobs</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                        <div className="h-full bg-[var(--brand-accent,#E39A6E)]" style={{ width: `${tech.utilizationPct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmbeddedEmptyState
                  compact
                  label="Throughput standby"
                  detail="No meaningful technician output yet for this period."
                  hint="Close active jobs to activate this signal."
                />
              )}
            </DashboardPanel>

            <DashboardPanel
              title="Business risk & opportunity"
              className="border-white/10 bg-[linear-gradient(155deg,rgba(2,6,23,0.7),rgba(7,10,18,0.6))]"
              action={<Link href="/dashboard/operations" className="inline-flex items-center gap-1 text-xs text-neutral-300 hover:text-white">Operations view <ChevronRight className="h-3 w-3" /></Link>}
            >
              {payload.businessSignals.length > 0 ? (
                <>
                  <CompactSignalList items={payload.businessSignals} />
                  <MiniSparkline data={payload.trend} dataKey="profit" />
                </>
              ) : (
                <EmbeddedEmptyState compact label="Opportunity feed waiting" detail="Signals appear when trend and risk thresholds are met." />
              )}
            </DashboardPanel>
          </div>
        </section>

        <aside className="space-y-2 xl:sticky xl:top-3 xl:self-start">
          <DashboardPanel
            title="Intelligence rail"
            className="border-amber-300/30 bg-[linear-gradient(150deg,rgba(36,22,8,0.42),rgba(8,11,24,0.84))]"
            action={<Link href="/dashboard/owner/reports" className="inline-flex items-center gap-1 text-xs text-neutral-300 hover:text-white">Open reports <ChevronRight className="h-3 w-3" /></Link>}
          >
            <div className="space-y-2">
              {payload.optimizationSummary.map((item) => (
                <Link
                  key={item.label}
                  href={riskHrefForLabel(item.label)}
                  className="group flex items-start justify-between gap-2 rounded-lg border px-2.5 py-2 transition hover:-translate-y-0.5 hover:brightness-110 hover:shadow-[0_0_0_1px_rgba(148,163,184,0.18),0_10px_18px_rgba(0,0,0,0.32)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent,#E39A6E)]/60"
                  style={{
                    borderColor: item.tone === "critical" ? "rgba(239,68,68,0.35)" : item.tone === "warning" ? "rgba(245,158,11,0.35)" : "rgba(148,163,184,0.25)",
                    background: item.tone === "critical" ? "rgba(127,29,29,0.16)" : item.tone === "warning" ? "rgba(120,53,15,0.15)" : "rgba(15,23,42,0.42)",
                  }}
                >
                  <div>
                    <div className="text-xs font-semibold text-white">{item.label}</div>
                    <div className="mt-1 text-[11px] text-neutral-300">{item.detail}</div>
                  </div>
                  <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-400 transition duration-200 group-hover:translate-x-1 group-hover:scale-110 group-hover:text-[var(--brand-accent,#E39A6E)]" />
                </Link>
              ))}

              {payload.businessSignals.length > 0 ? (
                <div className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-2">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-neutral-400">Signal snapshot</div>
                  <div className="mt-1.5 grid gap-1">
                    <CompactSignalList items={payload.businessSignals.slice(0, 3)} />
                  </div>
                </div>
              ) : null}
            </div>
          </DashboardPanel>
        </aside>
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
