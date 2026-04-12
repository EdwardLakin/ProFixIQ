import { AlertTriangle } from "lucide-react";

import {
  CompactSignalList,
  DashboardSectionShell,
  DashboardShell,
  DashboardTopStrip,
} from "./DashboardPrimitives";
import PerformanceTrendPanel from "./PerformanceTrendPanel";
import { getPerformanceDashboardPayload } from "@/features/dashboard/server/getPerformanceDashboardPayload";

export default async function PerformanceDashboardView() {
  const payload = await getPerformanceDashboardPayload();
  const displayName = payload.identity.fullName?.trim() || "there";

  return (
    <DashboardShell>
      <DashboardTopStrip
        view="performance"
        title="Performance Dashboard"
        name={displayName}
        subtitle="Business review view for KPI trajectory, technician output, and optimization risk."
        actions={[
          { label: "Full reports", href: "/dashboard/owner/reports" },
          { label: "Revenue view", href: "/dashboard/owner/reports/technicians" },
        ]}
        summary={[
          { label: "Revenue", value: `$${payload.kpis.revenue.toLocaleString()}` },
          { label: "Profit", value: `$${payload.kpis.profit.toLocaleString()}` },
          { label: "Jobs", value: String(payload.kpis.jobs) },
          { label: "Efficiency", value: `${payload.kpis.efficiencyPct}%` },
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-8">
          <DashboardSectionShell
            title="Trend / Performance Charts"
            description="Last 6 months of revenue and profit, sourced from a single finance range payload."
          >
            <PerformanceTrendPanel data={payload.trend} />
          </DashboardSectionShell>

          <DashboardSectionShell title="Technician / Throughput Performance" description="Completed-line output during the current month.">
            <CompactSignalList items={payload.technicianPerformance} />
          </DashboardSectionShell>
        </div>

        <div className="space-y-4 xl:col-span-4">
          <DashboardSectionShell title="Optimization / Revenue Risk Signals" description="Potential margin pressure and comeback risk signals.">
            <CompactSignalList items={payload.businessSignals} />
          </DashboardSectionShell>

          {payload.sectionErrors.length > 0 ? (
            <DashboardSectionShell title="Section Warnings">
              <div className="space-y-1.5 text-xs text-amber-300">
                {payload.sectionErrors.map((warning) => (
                  <div key={warning} className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5" />
                    <span>{warning}</span>
                  </div>
                ))}
              </div>
            </DashboardSectionShell>
          ) : null}
        </div>
      </div>
    </DashboardShell>
  );
}
