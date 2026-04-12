import Link from "next/link";
import { ActivitySquare, AlertTriangle, ArrowRight, TriangleAlert } from "lucide-react";

import { getOperationsDashboardPayload } from "@/features/dashboard/server/getOperationsDashboardPayload";
import { ActionRow, CompactSignalList, DashboardPanel, DashboardShell, DashboardTopStrip, MetricStrip } from "./DashboardPrimitives";
import { ShopLoadChart } from "./OperationsCharts";

export default async function OperationsDashboardView() {
  const payload = await getOperationsDashboardPayload();
  const displayName = payload.identity.fullName?.trim() || "Operator";
  const hasTechnicianActivity = payload.technicianActivity.length > 0;
  const hasLiveFlowData = payload.liveWork.length > 0 || payload.flowMix.length > 0;

  return (
    <DashboardShell>
      <DashboardTopStrip
        view="operations"
        title="Operations Dashboard"
        name={`Welcome back, ${displayName}`}
        subtitle="Live command center for active jobs, bottlenecks, and immediate dispatch actions."
        actions={[
          { label: "Create work order", href: "/work-orders/create", tone: "primary" },
          { label: "Dispatch", href: "/dashboard/manager/dispatch", tone: "secondary" },
        ]}
      />

      <MetricStrip
        items={[
          { label: "Active jobs", value: String(payload.topSummary.activeJobs) },
          { label: "Blocked", value: String(payload.topSummary.blockedJobs), tone: payload.topSummary.blockedJobs > 0 ? "accent" : "default" },
          { label: "Approvals", value: String(payload.topSummary.waitingApprovals), tone: payload.topSummary.waitingApprovals > 0 ? "accent" : "default" },
          { label: "Waiting parts", value: String(payload.topSummary.waitingParts), tone: payload.topSummary.waitingParts > 0 ? "accent" : "default" },
        ]}
      />

      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-12">
        <DashboardPanel title="Active Job Summary" className="min-h-[270px] md:min-h-[288px] xl:col-span-4">
          <div className="space-y-2.5">
            {payload.activeJobSummary.map((metric) => (
              <div key={metric.label} className="rounded-lg border border-white/10 bg-black/20 p-2.5 shadow-[inset_0_1px_0_rgba(148,163,184,0.08)]">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-neutral-300">{metric.label}</span>
                  <span className="text-sm font-semibold text-white">{metric.value}</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-[var(--brand-accent,#E39A6E)]"
                    style={{ width: `${metric.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </DashboardPanel>

        <DashboardPanel title="Live Shop Load" className="min-h-[270px] md:min-h-[288px] xl:col-span-5">
          <ShopLoadChart data={payload.liveShopLoad.map((item) => ({ label: item.label, count: item.count }))} />
        </DashboardPanel>

        <DashboardPanel
          title="Daily Summary"
          className="xl:col-span-3"
          action={<Link href="/dashboard/bookings" className="text-xs text-neutral-300 hover:text-white">Open</Link>}
        >
          <CompactSignalList items={payload.dailySummary} />
        </DashboardPanel>

        {hasTechnicianActivity ? (
          <DashboardPanel title="Technician Activity" className="xl:col-span-5">
            <div className="space-y-1.5">
              {payload.technicianActivity.map((tech) => (
                <div key={tech.id} className="grid grid-cols-[minmax(0,1fr)_76px_60px] items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-2.5 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold text-white">{tech.name}</div>
                    <div className="text-[11px] text-neutral-400">{tech.stage} · {tech.elapsed}</div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full bg-[var(--brand-accent,#E39A6E)]" style={{ width: `${tech.utilizationPct}%` }} />
                    </div>
                  </div>
                  <div className="text-right text-xs text-neutral-300">{tech.activeLines} lines</div>
                  <button type="button" className="rounded-full border border-white/10 px-2 py-1 text-[10px] text-neutral-300">View</button>
                </div>
              ))}
            </div>
          </DashboardPanel>
        ) : null}

        <DashboardPanel
          title="High Impact Alerts"
          className="xl:col-span-3"
          action={<Link href="/work-orders/board" className="text-xs text-neutral-300 hover:text-white">View all</Link>}
        >
          <div className="space-y-1.5">
            {payload.alerts.map((alert) => (
              <div
                key={alert.label}
                className="rounded-lg border p-2"
                style={{
                  borderColor: alert.tone === "critical" ? "rgba(239,68,68,0.4)" : alert.tone === "warning" ? "rgba(245,158,11,0.38)" : "rgba(148,163,184,0.25)",
                  background: alert.tone === "critical" ? "rgba(127,29,29,0.18)" : alert.tone === "warning" ? "rgba(120,53,15,0.18)" : "rgba(15,23,42,0.5)",
                }}
              >
                <div className="flex items-center gap-2 text-xs font-semibold text-white">
                  {alert.tone === "critical" ? <TriangleAlert className="h-3.5 w-3.5 text-red-300" /> : <AlertTriangle className="h-3.5 w-3.5 text-amber-300" />}
                  {alert.label}
                </div>
                <div className="mt-1 text-[11px] text-neutral-300">{alert.detail}</div>
              </div>
            ))}
          </div>
        </DashboardPanel>

        <DashboardPanel title="Suggested Actions" className="xl:col-span-4">
          <ActionRow actions={payload.suggestedActions} />
        </DashboardPanel>

        {hasLiveFlowData ? (
          <DashboardPanel title="Technician / Flow Mix" className="xl:col-span-8">
            <div className="grid gap-2 md:grid-cols-2">
              <div className="space-y-1.5">
                {payload.liveWork.map((item) => (
                  <div key={item.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 text-xs">
                    <div>
                      <div className="font-semibold text-white">{item.label}</div>
                      <div className="text-neutral-400">{item.stage}</div>
                    </div>
                    <div className="rounded-full border border-white/10 px-2 py-0.5 text-neutral-300">P{item.priority}</div>
                  </div>
                ))}
              </div>
              <div className="space-y-1.5">
                {payload.flowMix.map((row) => (
                  <div key={row.label} className="rounded-lg border border-white/10 bg-black/20 p-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-neutral-300">{row.label}</span>
                      <span className="font-semibold text-white">{row.value}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[var(--brand-primary,#C1663B)] to-[var(--brand-accent,#E39A6E)]"
                        style={{ width: `${Math.min(100, row.value * 12)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </DashboardPanel>
        ) : null}

        <DashboardPanel
          title="Revenue & Efficiency Snapshot"
          className="xl:col-span-4"
          action={<Link href="/dashboard/performance" className="inline-flex items-center gap-1 text-xs text-neutral-300 hover:text-white">Open <ArrowRight className="h-3 w-3" /></Link>}
        >
          <div className="space-y-2">
            <div className="rounded-lg border border-white/10 bg-black/25 p-2.5">
              <div className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">Revenue (MTD)</div>
              <div className="mt-1 text-xl font-semibold text-white">${payload.revenueEfficiency.revenue.toLocaleString()}</div>
            </div>
            <CompactSignalList
              items={[
                { label: "Profit", value: `$${payload.revenueEfficiency.profit.toLocaleString()}` },
                { label: "Efficiency", value: `${payload.revenueEfficiency.efficiencyPct}%` },
                { label: "Active lines", value: String(payload.revenueEfficiency.completedLines) },
              ]}
            />
          </div>
        </DashboardPanel>
      </div>

      {payload.sectionErrors.length > 0 ? (
        <section className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2.5">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-300">
            <ActivitySquare className="h-3.5 w-3.5" />
            Section warnings
          </div>
          <div className="space-y-1 text-xs text-amber-200">
            {payload.sectionErrors.map((warning) => (
              <div key={warning} className="flex items-start gap-2 rounded-md border border-amber-500/25 bg-black/20 px-2 py-1.5">
                <AlertTriangle className="mt-0.5 h-3 w-3" />
                <span>{warning}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </DashboardShell>
  );
}
