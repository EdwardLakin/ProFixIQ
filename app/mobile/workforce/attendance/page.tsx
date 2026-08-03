import {
  ChevronRight,
  Clock3,
  RadioTower,
  UserCheck,
  Users,
  Wrench,
} from "lucide-react";
import Link from "next/link";

import { getOperationsDashboardPayload } from "@/features/dashboard/server/getOperationsDashboardPayload";

export const dynamic = "force-dynamic";

export default async function MobileAttendancePage() {
  const payload = await getOperationsDashboardPayload();
  const technicians = payload.technicianActivity;
  const activeTechnicians = technicians.filter((tech) => tech.activeLines > 0).length;
  const availableTechnicians = Math.max(0, technicians.length - activeTechnicians);

  return (
    <main className="mx-auto w-full max-w-3xl space-y-3 px-3 py-3 sm:px-4">
      <section className="mobile-dashboard-hero">
        <div className="flex items-start gap-3">
          <span className="inline-grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/15 bg-white/10 text-[#8ed4ff]">
            <Users aria-hidden className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="mobile-dashboard-hero__eyebrow">Workforce</div>
            <h1 className="mobile-dashboard-hero__title">Attendance & activity</h1>
            <p className="mobile-dashboard-hero__subtitle">
              See who is clocked in, what is active and where capacity is available.
            </p>
          </div>
        </div>
      </section>

      <section className="mobile-dashboard-metrics" aria-label="Workforce metrics">
        <div className="mobile-dashboard-metric" data-tone="positive">
          <div className="flex items-center justify-between gap-2">
            <div className="mobile-dashboard-metric__label">Clocked in</div>
            <UserCheck className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mobile-dashboard-metric__value">
            {payload.topSummary.techniciansClockedIn}
          </div>
        </div>
        <div className="mobile-dashboard-metric">
          <div className="flex items-center justify-between gap-2">
            <div className="mobile-dashboard-metric__label">Working</div>
            <Wrench className="h-4 w-4 text-[color:var(--accent-copper)]" />
          </div>
          <div className="mobile-dashboard-metric__value">{activeTechnicians}</div>
        </div>
        <div className="mobile-dashboard-metric">
          <div className="flex items-center justify-between gap-2">
            <div className="mobile-dashboard-metric__label">Available</div>
            <Clock3 className="h-4 w-4 text-[color:var(--accent-copper)]" />
          </div>
          <div className="mobile-dashboard-metric__value">{availableTechnicians}</div>
        </div>
        <Link href="/mobile/dispatch" className="mobile-dashboard-metric">
          <div className="flex items-center justify-between gap-2">
            <div className="mobile-dashboard-metric__label">Dispatch</div>
            <RadioTower className="h-4 w-4 text-[color:var(--accent-copper)]" />
          </div>
          <div className="mt-3 text-sm font-extrabold text-[color:var(--accent-copper)]">
            Review capacity
          </div>
        </Link>
      </section>

      <section className="mobile-dashboard-attention">
        <div className="mobile-dashboard-attention__header">
          <h2 className="text-lg font-bold tracking-[-0.025em] text-[color:var(--theme-text-primary)]">
            Technicians on shift
          </h2>
          <p className="mt-0.5 text-xs text-[color:var(--theme-text-secondary)]">
            Current activity and elapsed job time.
          </p>
        </div>

        {technicians.length > 0 ? (
          <div>
            {technicians.map((tech) => (
              <Link
                key={tech.id}
                href="/mobile/dispatch"
                className="mobile-dashboard-attention__row"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={`inline-grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-sm font-extrabold ${
                      tech.activeLines > 0
                        ? "bg-blue-500/12 text-blue-600 dark:text-blue-300"
                        : "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300"
                    }`}
                  >
                    {tech.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-bold text-[color:var(--theme-text-primary)]">
                      {tech.name}
                    </span>
                    <span className="mt-1 block text-xs text-[color:var(--theme-text-secondary)]">
                      {tech.activeLines > 0
                        ? `${tech.activeLines} active job${tech.activeLines === 1 ? "" : "s"}`
                        : "Available for work"}
                    </span>
                  </span>
                </div>
                <span className="flex shrink-0 items-center gap-2 text-right">
                  <span>
                    <span className="block text-xs font-semibold capitalize text-[color:var(--theme-text-primary)]">
                      {tech.stage}
                    </span>
                    <span className="mt-1 block text-[0.65rem] text-[color:var(--theme-text-muted)]">
                      {tech.elapsed}
                    </span>
                  </span>
                  <ChevronRight className="h-5 w-5 text-[color:var(--accent-copper)]" />
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="p-5 text-sm text-[color:var(--theme-text-secondary)]">
            No technicians are currently clocked in.
          </div>
        )}
      </section>
    </main>
  );
}
