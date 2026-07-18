import Link from "next/link";

import { getOperationsDashboardPayload } from "@/features/dashboard/server/getOperationsDashboardPayload";

export const dynamic = "force-dynamic";

export default async function MobileAttendancePage() {
  const payload = await getOperationsDashboardPayload();
  const technicians = payload.technicianActivity;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 overflow-x-hidden px-3 py-3 sm:px-4">
      <section className="rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4 shadow-[var(--theme-shadow-medium)]">
        <div className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[color:var(--accent-copper)]">
          Workforce
        </div>
        <h1 className="mt-2 text-2xl font-semibold text-[color:var(--theme-text-primary)]">
          Attendance & activity
        </h1>
        <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
          See who is clocked in, what they are working on, and where capacity is available.
        </p>
      </section>

      <section className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl border border-emerald-500/35 bg-emerald-500/10 p-3">
          <div className="text-xs text-[color:var(--theme-text-secondary)]">Clocked in</div>
          <div className="mt-1 text-2xl font-semibold text-[color:var(--theme-text-primary)]">
            {payload.topSummary.techniciansClockedIn}
          </div>
        </div>
        <Link href="/mobile/dispatch" className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-3">
          <div className="text-xs text-[color:var(--theme-text-secondary)]">Dispatch</div>
          <div className="mt-1 text-sm font-semibold text-[color:var(--accent-copper)]">Review capacity →</div>
        </Link>
      </section>

      <section className="overflow-hidden rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)]">
        <div className="border-b border-[color:var(--theme-border-soft)] p-4">
          <h2 className="text-xl font-semibold text-[color:var(--theme-text-primary)]">Technicians on shift</h2>
        </div>
        {technicians.length > 0 ? (
          <div className="divide-y divide-[color:var(--theme-border-soft)]">
            {technicians.map((tech) => (
              <div key={tech.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-[color:var(--theme-text-primary)]">{tech.name}</div>
                    <div className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
                      {tech.activeLines > 0 ? `${tech.activeLines} active job${tech.activeLines === 1 ? "" : "s"}` : "Available for work"}
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-xs text-[color:var(--theme-text-secondary)]">
                    <div>{tech.stage}</div>
                    <div className="mt-1">{tech.elapsed}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4 text-sm text-[color:var(--theme-text-secondary)]">No technicians are currently clocked in.</div>
        )}
      </section>
    </div>
  );
}
