// features/fleet/components/FleetPortalDashboard.tsx
"use client";

import Link from "next/link";
import type {
  FleetUnit,
  FleetIssue,
  DispatchAssignment,
} from "./FleetControlTower";

type Props = {
  // Optional overrides if you want to pass real data later
  fleetName?: string | null;
  contactName?: string | null;
  units?: FleetUnit[];
  issues?: FleetIssue[];
  assignments?: DispatchAssignment[];
};

export default function FleetPortalDashboard({
  fleetName,
  contactName,
  units,
  issues,
  assignments,
}: Props) {
  // 🔹 Use real units if provided, otherwise fall back to demo
  const demoUnits: FleetUnit[] =
    units ??
    [
      {
        id: "unit-421",
        label: "HD-421 Tractor",
        location: "Calgary Yard A",
        status: "in_service",
        class: "Tractor",
        nextInspectionDate: "2026-01-03",
      },
      {
        id: "unit-178",
        label: "Trailer-178",
        location: "Calgary Yard A",
        status: "limited",
        class: "Dry Van",
        nextInspectionDate: "2026-01-10",
      },
    ];

  const demoAssignments: DispatchAssignment[] =
    assignments ??
    [
      {
        id: "assign-1",
        driverName: contactName || "You",
        driverId: "driver-self",
        unitLabel: "HD-421 Tractor",
        unitId: "unit-421",
        routeLabel: "Calgary ↔ Edmonton Linehaul",
        nextPreTripDue: "2025-12-30T06:30:00Z",
        state: "pretrip_due",
      },
    ];

  const demoIssues: FleetIssue[] =
    issues ??
    [
      {
        id: "issue-1",
        unitId: "unit-421",
        unitLabel: "HD-421 Tractor",
        severity: "safety",
        summary: "Steer axle brake lining at limit (from inspection)",
        createdAt: "2025-12-27T09:32:00Z",
        status: "open",
      },
      {
        id: "issue-2",
        unitId: "unit-178",
        unitLabel: "Trailer-178",
        severity: "compliance",
        summary: "Annual CVIP due in 3 days",
        createdAt: "2025-12-28T13:15:00Z",
        status: "open",
      },
    ];

  const name = fleetName || "Your fleet";

  return (
    <section className="space-y-6">
      {/* Top header */}
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">
            Fleet Portal
          </p>
          <h1
            className="mt-1 text-3xl md:text-4xl text-neutral-100"
            style={{ fontFamily: "var(--font-blackops)" }}
          >
            {name} – Portal Dispatch
          </h1>
          <p className="mt-2 max-w-xl text-sm text-neutral-400">
            See your assigned units, submit pre-trips, and track open service
            requests. What your drivers see, your shop and dispatch can see too.
          </p>
          {/* ✅ uses demoUnits so TS stops complaining */}
          <p className="mt-1 text-[11px] text-neutral-500">
            {demoUnits.length} active units visible in this portal.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="accent-chip px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]">
            HD / Fleet Portal
          </span>
        </div>
      </header>

      {/* Assigned units / Start pre-trip */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 metal-card rounded-3xl p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-neutral-100">
                My assigned units
              </h2>
              <p className="mt-1 text-xs text-neutral-400">
                Pick your unit, complete the pre-trip, and send defects back to
                dispatch.
              </p>
            </div>

            <span className="hidden rounded-full border border-white/10 bg-black/40 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-300 md:inline-flex">
              Daily pre-trip • Compliance
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {demoAssignments.map((assign) => (
              <div
                key={assign.id}
                className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/40 p-3 text-xs md:flex-row md:items-center md:justify-between"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="accent-chip px-2 py-0.5 text-[10px]">
                      {assign.unitLabel}
                    </span>
                    {assign.routeLabel && (
                      <span className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">
                        {assign.routeLabel}
                      </span>
                    )}
                  </div>
                  <div className="text-neutral-300">
                    Driver:{" "}
                    <span className="font-medium">{assign.driverName}</span>
                  </div>
                  {assign.nextPreTripDue && (
                    <div className="text-neutral-500">
                      Next pre-trip due:{" "}
                      <span className="text-neutral-300">
                        {assign.nextPreTripDue}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-white/15 bg-black/40 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-neutral-300">
                    {assign.state === "pretrip_due"
                      ? "Pre-trip required"
                      : assign.state === "en_route"
                      ? "En route"
                      : "In shop"}
                  </span>

                  <Link
                    href={`/mobile/fleet/pretrip/${assign.unitId}?driver=${encodeURIComponent(
                      assign.driverName,
                    )}`}
                    className="rounded-xl px-3 py-1.5 text-xs font-semibold text-black"
                    style={{ backgroundColor: "var(--accent-copper)" }}
                  >
                    Start pre-trip
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick health snapshot for the portal side */}
        <div className="metal-card rounded-3xl p-4 text-xs">
          <h2 className="text-sm font-semibold text-neutral-100">
            Fleet health snapshot
          </h2>
          <p className="mt-1 text-xs text-neutral-400">
            A quick view of units with open safety or compliance items from
            inspections and pre-trips.
          </p>

          <div className="mt-4 space-y-3">
            { (issues ?? demoIssues).map((issue) => (
              <div
                key={issue.id}
                className="rounded-2xl border border-white/10 bg-black/40 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="accent-chip px-2 py-0.5 text-[10px]">
                    {issue.unitLabel}
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.18em] text-neutral-400">
                    {issue.severity === "safety"
                      ? "Safety"
                      : issue.severity === "compliance"
                      ? "Compliance"
                      : "Recommend"}
                  </span>
                </div>
                <p className="mt-2 text-neutral-200">{issue.summary}</p>
                <p className="mt-1 text-[10px] text-neutral-500">
                  Status:{" "}
                  <span className="text-neutral-300">{issue.status}</span>
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-col gap-2">
            <Link
              href="/fleet/service-requests"
              className="rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-center text-xs font-semibold text-neutral-100 hover:bg-neutral-900/40"
            >
              View service requests in shop
            </Link>
            <p className="text-[10px] text-neutral-500">
              Fleet portal shows what’s open; shop view handles scheduling and
              work orders.
            </p>
          </div>
        </div>
      </div>

      {/* Pre-trip history placeholder */}
      <div className="metal-card mt-4 rounded-3xl p-4 text-xs">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-neutral-100">
              Pre-trip history
            </h2>
            <p className="mt-1 text-xs text-neutral-400">
              Track past pre-trips, missed days, and defects for audit and
              coaching.
            </p>
          </div>
          <span className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">
            Coming from fleet_pretrip_reports
          </span>
        </div>
      </div>
    </section>
  );
}