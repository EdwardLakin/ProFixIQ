import Link from "next/link";
import { AlertTriangle, ChevronRight } from "lucide-react";

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
        className="mb-0.5"
        items={[
          { label: "Revenue", value: `$${payload.kpis.revenue.toLocaleString()}` },
          { label: "Profit", value: `$${payload.kpis.profit.toLocaleString()}` },
          { label: "Jobs", value: String(payload.kpis.jobs) },
          { label: "Efficiency", value: `${payload.kpis.efficiencyPct}%`, tone: payload.kpis.efficiencyPct < 25 ? "accent" : "default" },
        ]}
      />

      <div
        className="grid gap-2 rounded-[22px] border border-white/10 p-2.5 md:p-3 xl:grid-cols-[minmax(0,1.95fr)_minmax(300px,1fr)]"
        style={{
          background: "linear-gradient(160deg, rgba(4,8,20,0.9), rgba(8,14,30,0.72) 45%, rgba(4,10,24,0.8))",
          boxShadow: "inset 0 1px 0 rgba(148,163,184,0.1), 0 20px 40px rgba(0,0,0,0.28)",
        }}
      >
        <section className="space-y-2">
          <DashboardPanel eyebrow="Primary" title="Trend / Performance Charts" className="border-white/10 min-h-[338px] bg-[linear-gradient(155deg,rgba(9,16,34,0.92),rgba(8,14,29,0.82))]">
            <PerformanceTrendPanel data={payload.trend} />
          </DashboardPanel>

          <div className="grid gap-2 md:grid-cols-2">
            <DashboardPanel eyebrow="Support" title="Technician / Throughput Performance" className="border-white/5 bg-[linear-gradient(155deg,rgba(6,11,24,0.8),rgba(9,14,28,0.7))]">
              <div className="space-y-1.5">
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

            <DashboardPanel eyebrow="Support" title="Revenue Watch" className="border-white/5 bg-[linear-gradient(155deg,rgba(6,11,24,0.8),rgba(9,14,28,0.7))]">
              <CompactSignalList items={payload.revenueWatch} />
              <MiniSparkline data={payload.trend} dataKey="revenue" />
            </DashboardPanel>
          </div>
        </section>

        <aside className="space-y-2.5">
          <DashboardPanel eyebrow="Risk Rail" title="Optimization / Revenue Risk Signals" className="border-amber-300/30 bg-[linear-gradient(150deg,rgba(36,22,8,0.42),rgba(8,11,24,0.84))]">
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

          <DashboardPanel
            eyebrow="Opportunity"
            title="Business Risk / Opportunity"
            className="border-white/10 bg-[linear-gradient(155deg,rgba(2,6,23,0.7),rgba(7,10,18,0.6))]"
            action={<Link href="/dashboard/operations" className="inline-flex items-center gap-1 text-xs text-neutral-300 hover:text-white">Operations view <ChevronRight className="h-3 w-3" /></Link>}
          >
            <CompactSignalList items={payload.businessSignals} />
            <MiniSparkline data={payload.trend} dataKey="profit" />
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
