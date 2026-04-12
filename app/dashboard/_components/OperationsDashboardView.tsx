import { AlertTriangle } from "lucide-react";

import {
  ActionRow,
  CompactSignalList,
  DashboardSectionShell,
  DashboardShell,
  DashboardTopStrip,
} from "./DashboardPrimitives";
import { getOperationsDashboardPayload } from "@/features/dashboard/server/getOperationsDashboardPayload";

export default async function OperationsDashboardView() {
  const payload = await getOperationsDashboardPayload();
  const displayName = payload.identity.fullName?.trim() || "there";

  return (
    <DashboardShell>
      <DashboardTopStrip
        view="operations"
        title="Operations Dashboard"
        name={displayName}
        subtitle="Live command center for blockers, active jobs, and immediate next actions."
        actions={[
          { label: "Create work order", href: "/work-orders/create" },
          { label: "Dispatch", href: "/dashboard/manager/dispatch" },
        ]}
        summary={[
          { label: "Active jobs", value: String(payload.topSummary.activeJobs) },
          { label: "Blocked", value: String(payload.topSummary.blockedJobs) },
          { label: "Approvals", value: String(payload.topSummary.waitingApprovals) },
          { label: "Waiting parts", value: String(payload.topSummary.waitingParts) },
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-8">
          <DashboardSectionShell title="Live Work / Active Jobs" description="Current board flow and priority stack.">
            <div className="space-y-2">
              {payload.liveWork.map((item) => (
                <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-xs">
                  <div>
                    <div className="font-semibold text-white">{item.label}</div>
                    <div className="text-neutral-400">{item.stage}</div>
                  </div>
                  <div className={item.risk === "danger" ? "text-[color:var(--brand-accent)]" : "text-neutral-300"}>
                    {item.risk}
                  </div>
                  <div className="rounded-full border border-white/10 px-2 py-0.5 text-neutral-300">P{item.priority}</div>
                </div>
              ))}
            </div>
          </DashboardSectionShell>

          <DashboardSectionShell title="Technician Activity / Current Flow" description="Team-level active line pressure.">
            <CompactSignalList items={payload.technicianFlow} />
          </DashboardSectionShell>
        </div>

        <div className="space-y-4 xl:col-span-4">
          <DashboardSectionShell title="Blocker Stack" description="Approvals, waiting parts, and on-hold pressure.">
            <CompactSignalList items={payload.blockerStack} />
          </DashboardSectionShell>

          <DashboardSectionShell title="Suggested Actions" description="Highest-leverage operational actions right now.">
            <ActionRow actions={payload.suggestedActions} />
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
