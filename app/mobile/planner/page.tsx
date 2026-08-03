"use client";

import {
  Boxes,
  CalendarDays,
  ChevronRight,
  RadioTower,
  Route,
  Truck,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";

const WORKSPACES: Array<{
  title: string;
  detail: string;
  href: string;
  icon: LucideIcon;
}> = [
  {
    title: "Dispatch",
    detail: "Balance technicians, active jobs and blockers.",
    href: "/mobile/dispatch",
    icon: RadioTower,
  },
  {
    title: "Work orders",
    detail: "Review live work and open the correct mobile record.",
    href: "/mobile/work-orders",
    icon: Wrench,
  },
  {
    title: "Appointments",
    detail: "Review arrivals and manage the day.",
    href: "/mobile/appointments",
    icon: CalendarDays,
  },
  {
    title: "Parts",
    detail: "Open requests, receiving and ready parts.",
    href: "/mobile/parts",
    icon: Boxes,
  },
  {
    title: "Attendance",
    detail: "See staff on shift and current activity.",
    href: "/mobile/workforce/attendance",
    icon: Users,
  },
  {
    title: "Fleet",
    detail: "Review units, pre-trips and service requests.",
    href: "/mobile/fleet",
    icon: Truck,
  },
];

export default function MobilePlannerPage() {
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();

  const context = useMemo(() => {
    const params = new URLSearchParams(searchKey);
    return {
      goal: params.get("goal")?.trim() || null,
      workOrderId: params.get("workOrderId")?.trim() || null,
      bookingId: params.get("bookingId")?.trim() || null,
      vehicleId: params.get("vehicleId")?.trim() || null,
    };
  }, [searchKey]);

  const contextualHref = context.workOrderId
    ? `/mobile/work-orders/${context.workOrderId}`
    : context.bookingId
      ? "/mobile/appointments"
      : context.vehicleId
        ? `/mobile/fleet?unit=${encodeURIComponent(context.vehicleId)}`
        : null;

  return (
    <main className="mx-auto w-full max-w-3xl space-y-3 px-3 py-3 sm:px-4">
      <section className="mobile-dashboard-hero">
        <div className="flex items-start gap-3">
          <span className="inline-grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/15 bg-white/10 text-[#8ed4ff]">
            <Route aria-hidden className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="mobile-dashboard-hero__eyebrow">Operations planner</div>
            <h1 className="mobile-dashboard-hero__title">Open the right workspace</h1>
            <p className="mobile-dashboard-hero__subtitle">
              Role-controlled operational destinations organized for fast mobile access.
            </p>
          </div>
        </div>
      </section>

      {context.goal || contextualHref ? (
        <section className="mobile-command-panel border p-4">
          <div className="text-[0.65rem] font-extrabold uppercase tracking-[0.17em] text-[color:var(--theme-text-muted)]">
            Current context
          </div>
          {context.goal ? (
            <p className="mt-2 text-sm font-semibold text-[color:var(--theme-text-primary)]">
              {context.goal}
            </p>
          ) : null}
          {contextualHref ? (
            <Link
              href={contextualHref}
              className="mobile-command-primary mt-3 flex w-full items-center justify-center gap-2 px-4 text-sm font-bold"
            >
              Open related record
              <ChevronRight aria-hidden className="h-4 w-4" />
            </Link>
          ) : null}
        </section>
      ) : null}

      <section className="mobile-command-panel overflow-hidden border">
        <div className="border-b border-[color:var(--theme-border-soft)] px-4 py-3.5">
          <h2 className="text-base font-bold text-[color:var(--theme-text-primary)]">
            Mobile workspaces
          </h2>
          <p className="mt-0.5 text-xs text-[color:var(--theme-text-secondary)]">
            Stay inside the mobile application from start to finish.
          </p>
        </div>
        <div className="sm:grid sm:grid-cols-2">
          {WORKSPACES.map((workspace, index) => {
            const Icon = workspace.icon;
            return (
              <Link
                key={workspace.href}
                href={workspace.href}
                className={`flex min-h-[5.5rem] items-center gap-3 border-b border-[color:var(--theme-border-soft)] px-4 py-3 active:bg-[color:var(--theme-surface-hover)] sm:last:border-b-0 ${
                  index % 2 === 0
                    ? "sm:border-r sm:border-[color:var(--theme-border-soft)]"
                    : ""
                }`}
              >
                <span className="inline-grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-300">
                  <Icon aria-hidden className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-[color:var(--theme-text-primary)]">
                    {workspace.title}
                  </span>
                  <span className="mt-1 block text-xs leading-4 text-[color:var(--theme-text-secondary)]">
                    {workspace.detail}
                  </span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-[color:var(--accent-copper)]" />
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}
