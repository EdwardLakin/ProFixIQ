"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";

const WORKSPACES = [
  {
    title: "Dispatch",
    detail: "Balance technicians, bays, active jobs, and blockers.",
    href: "/mobile/dispatch",
  },
  {
    title: "Work orders",
    detail: "Review live work and open the correct mobile work order.",
    href: "/mobile/work-orders",
  },
  {
    title: "Appointments",
    detail: "Review arrivals and manage the day from mobile.",
    href: "/mobile/appointments",
  },
  {
    title: "Parts",
    detail: "Open requests, receiving, and ready parts.",
    href: "/mobile/parts",
  },
  {
    title: "Attendance",
    detail: "See staff on shift and current activity.",
    href: "/mobile/workforce/attendance",
  },
  {
    title: "Fleet",
    detail: "Review units, pre-trips, and service requests.",
    href: "/mobile/fleet",
  },
] as const;

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
    <div className="mx-auto w-full max-w-3xl space-y-4 px-3 py-3 sm:px-4">
      <section className="rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4 shadow-[var(--theme-shadow-medium)]">
        <div className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[var(--accent-copper)]">
          Operations planner
        </div>
        <h1 className="mt-2 text-2xl font-semibold text-[color:var(--theme-text-primary)]">
          Choose the workspace you need
        </h1>
        <p className="mt-1 text-sm leading-6 text-[color:var(--theme-text-secondary)]">
          Planning remains manual and role-controlled. This page keeps the useful
          operational destinations together without leaving the mobile app.
        </p>
      </section>

      {context.goal || contextualHref ? (
        <section className="rounded-3xl border border-[var(--accent-copper-soft)]/40 bg-[color:var(--theme-surface-panel)] p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]">
            Current context
          </div>
          {context.goal ? (
            <p className="mt-2 text-sm text-[color:var(--theme-text-primary)]">
              {context.goal}
            </p>
          ) : null}
          {contextualHref ? (
            <Link
              href={contextualHref}
              className="mt-3 flex min-h-11 items-center justify-center rounded-xl bg-[color:var(--accent-copper)] px-4 text-sm font-semibold text-white"
            >
              Open related mobile record
            </Link>
          ) : null}
        </section>
      ) : null}

      <section className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {WORKSPACES.map((workspace) => (
          <Link
            key={workspace.href}
            href={workspace.href}
            className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-4 active:scale-[0.99]"
          >
            <div className="font-semibold text-[color:var(--theme-text-primary)]">
              {workspace.title}
            </div>
            <div className="mt-1 text-sm leading-5 text-[color:var(--theme-text-secondary)]">
              {workspace.detail}
            </div>
          </Link>
        ))}
      </section>
    </div>
  );
}
