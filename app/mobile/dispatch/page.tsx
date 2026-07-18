import Link from "next/link";

import { getOperationsDashboardPayload } from "@/features/dashboard/server/getOperationsDashboardPayload";

export const dynamic = "force-dynamic";

export default async function MobileDispatchPage() {
  const payload = await getOperationsDashboardPayload();

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 overflow-x-hidden px-3 py-3 sm:px-4">
      <section className="rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4 shadow-[var(--theme-shadow-medium)]">
        <div className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[color:var(--accent-copper)]">Dispatch</div>
        <h1 className="mt-2 text-2xl font-semibold text-[color:var(--theme-text-primary)]">Live shop floor</h1>
        <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">Review active work, blockers, and technician capacity without leaving mobile.</p>
      </section>

      <section className="grid grid-cols-2 gap-2">
        {[
          ["Active jobs", payload.topSummary.activeJobs, "/mobile/work-orders"],
          ["Blocked", payload.topSummary.blockedJobs, "/mobile/work-orders?view=blocked"],
          ["Techs clocked in", payload.topSummary.techniciansClockedIn, "/mobile/workforce/attendance"],
          ["Waiting parts", payload.topSummary.waitingParts, "/mobile/parts"],
        ].map(([label, value, href]) => (
          <Link key={String(label)} href={String(href)} className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-3">
            <div className="text-xs text-[color:var(--theme-text-secondary)]">{label}</div>
            <div className="mt-1 text-2xl font-semibold text-[color:var(--theme-text-primary)]">{value}</div>
          </Link>
        ))}
      </section>

      <section className="overflow-hidden rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)]">
        <div className="border-b border-[color:var(--theme-border-soft)] p-4">
          <h2 className="text-xl font-semibold text-[color:var(--theme-text-primary)]">Work in motion</h2>
        </div>
        {payload.liveWork.length > 0 ? (
          <div className="divide-y divide-[color:var(--theme-border-soft)]">
            {payload.liveWork.slice(0, 12).map((item) => (
              <Link key={item.id} href={`/mobile/work-orders/${item.id}`} className="block p-4 active:bg-[color:var(--theme-surface-overlay)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-[color:var(--theme-text-primary)]">{item.label}</div>
                    <div className="mt-1 text-sm capitalize text-[color:var(--theme-text-secondary)]">{item.stage.replaceAll("_", " ")}</div>
                  </div>
                  <span className="shrink-0 text-xs font-medium text-[color:var(--accent-copper)]">Open →</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="p-4 text-sm text-[color:var(--theme-text-secondary)]">No active work is available.</div>
        )}
      </section>
    </div>
  );
}
