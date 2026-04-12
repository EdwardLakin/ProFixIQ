import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { getPerformanceDashboardPayload } from "@/features/dashboard/server/getPerformanceDashboardPayload";
import { CompactSignalList, DashboardPanel, DashboardShell, DashboardTopStrip, MetricStrip } from "./DashboardPrimitives";
import PerformanceTrendPanel, { MiniSparkline } from "./PerformanceTrendPanel";

export default async function PerformanceDashboardView() {
  const payload = await getPerformanceDashboardPayload();
  const displayName = payload.identity.fullName?.trim() || "Operator";

  return (
    <DashboardShell>
      <DashboardTopStrip
        view="performance"
        title="Performance Dashboard"
        name={`Executive review, ${displayName}`}
        subtitle="Revenue, margin, and operational performance with compact optimization risk tracking."
        actions={[
          { label: "Full reports", href: "/dashboard/owner/reports", tone: "primary" },
          { label: "Revenue detail", href: "/dashboard/owner/reports/technicians", tone: "secondary" },
        ]}
      />

      <MetricStrip
        items={[
          { label: "Revenue", value: `$${payload.kpis.revenue.toLocaleString()}` },
          { label: "Profit", value: `$${payload.kpis.profit.toLocaleString()}` },
          { label: "Jobs", value: String(payload.kpis.jobs) },
          { label: "Efficiency", value: `${payload.kpis.efficiencyPct}%`, tone: payload.kpis.efficiencyPct < 25 ? "accent" : "default" },
        ]}
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-12">
        <DashboardPanel eyebrow="Row A" title="Trend / Performance Charts" className="xl:col-span-8">
          <PerformanceTrendPanel data={payload.trend} />
        </DashboardPanel>

        <DashboardPanel eyebrow="Row A" title="Optimization / Revenue Risk Signals" className="xl:col-span-4">
          <CompactSignalList items={payload.businessSignals} />
          <div className="mt-3 space-y-1.5">
            {payload.optimizationSummary.map((item) => (
              <div
                key={item.label}
                className="rounded-lg border px-2.5 py-2"
                style={{
                  borderColor: item.tone === "critical" ? "rgba(239,68,68,0.35)" : item.tone === "warning" ? "rgba(245,158,11,0.35)" : "rgba(148,163,184,0.25)",
                  background: item.tone === "critical" ? "rgba(127,29,29,0.16)" : item.tone === "warning" ? "rgba(120,53,15,0.15)" : "rgba(15,23,42,0.42)",
                }}
              >
                <div className="text-xs font-semibold text-white">{item.label}</div>
                <div className="mt-1 text-[11px] text-neutral-300">{item.detail}</div>
              </div>
            ))}
          </div>
        </DashboardPanel>

        <DashboardPanel eyebrow="Row B" title="Technician / Throughput Performance" className="xl:col-span-4">
          <div className="space-y-2">
            {payload.technicianPerformance.map((tech) => (
              <div key={tech.label} className="rounded-lg border border-white/10 bg-black/20 p-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-white">{tech.label}</span>
                  <span className="text-neutral-300">{tech.completed} completed</span>
                </div>
                <div className="mt-1 text-[11px] text-neutral-400">{tech.pace}</div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full bg-[var(--brand-accent,#E39A6E)]" style={{ width: `${tech.utilizationPct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </DashboardPanel>

        <DashboardPanel eyebrow="Row B" title="Revenue Watch" className="xl:col-span-4">
          <CompactSignalList items={payload.revenueWatch} />
          <MiniSparkline data={payload.trend} dataKey="revenue" />
        </DashboardPanel>

        <DashboardPanel
          eyebrow="Row B"
          title="Business Risk / Opportunity"
          className="xl:col-span-4"
          action={<Link href="/dashboard/operations" className="text-xs text-neutral-300 hover:text-white">Operations view</Link>}
        >
          <CompactSignalList items={payload.businessSignals} />
          <MiniSparkline data={payload.trend} dataKey="profit" />
        </DashboardPanel>
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
