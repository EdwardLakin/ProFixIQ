// features/fleet/components/FleetControlTower.tsx
"use client";

import { useMemo, useState } from "react";
import FleetSummaryCards from "./FleetSummaryCards";
import FleetIssueTables from "./FleetIssueTables";
import FleetAISummary from "./FleetAISummary";

export type FleetUnitStatus = "in_service" | "limited" | "oos";

export type FleetUnit = {
  id: string;
  label: string; // e.g. "Truck 421"
  plate?: string | null;
  vin?: string | null;
  class?: string | null; // Tractor, Trailer, Straight Truck, Bus
  location?: string | null;
  status: FleetUnitStatus;
  nextInspectionDate?: string | null; // ISO
};

export type FleetIssue = {
  id: string;
  unitId: string;
  unitLabel: string;
  severity: "safety" | "compliance" | "recommend";
  summary: string;
  createdAt: string; // ISO
  status: "open" | "scheduled" | "completed";
};

export type DispatchAssignment = {
  id: string;
  driverName: string;
  driverId: string;
  unitLabel: string;
  unitId: string;
  routeLabel?: string | null;
  nextPreTripDue?: string | null;
  state: "pretrip_due" | "en_route" | "in_shop";
};

type Props = {
  shopName: string;
  shopId?: string | null;
};

export default function FleetControlTower({ shopName, shopId }: Props) {
  // TODO: Replace mock data with Supabase-backed hooks
  const [regionFilter, setRegionFilter] = useState<string | "all">("all");

  const mockUnits: FleetUnit[] = useMemo(
    () => [
      {
        id: "unit-421",
        label: "HD-421 Tractor",
        location: "Calgary Yard A",
        status: "oos",
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
      {
        id: "unit-912",
        label: "HD-912 Tractor",
        location: "Edmonton Yard",
        status: "in_service",
        class: "Tractor",
        nextInspectionDate: "2026-01-06",
      },
    ],
    [],
  );

  const mockIssues: FleetIssue[] = useMemo(
    () => [
      {
        id: "issue-1",
        unitId: "unit-421",
        unitLabel: "HD-421 Tractor",
        severity: "safety",
        summary: "Steer axle brake lining at limit",
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
      {
        id: "issue-3",
        unitId: "unit-912",
        unitLabel: "HD-912 Tractor",
        severity: "recommend",
        summary: "Minor seep at rear differential",
        createdAt: "2025-12-22T16:05:00Z",
        status: "scheduled",
      },
    ],
    [],
  );

  const mockAssignments: DispatchAssignment[] = useMemo(
    () => [
      {
        id: "assign-1",
        driverName: "K. Singh",
        driverId: "driver-1",
        unitLabel: "HD-421 Tractor",
        unitId: "unit-421",
        routeLabel: "Calgary ↔ Edmonton Linehaul",
        nextPreTripDue: "2025-12-30T06:30:00Z",
        state: "pretrip_due",
      },
      {
        id: "assign-2",
        driverName: "M. Alvarez",
        driverId: "driver-2",
        unitLabel: "Trailer-178",
        unitId: "unit-178",
        routeLabel: "Calgary City P&D",
        nextPreTripDue: "2025-12-30T07:00:00Z",
        state: "en_route",
      },
    ],
    [],
  );

  const filteredUnits =
    regionFilter === "all"
      ? mockUnits
      : mockUnits.filter((u) => u.location === regionFilter);

  return (
    <section className="space-y-6">
      {/* Top header */}
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">
            Fleet Control
          </p>
          <h1
            className="mt-1 text-3xl md:text-4xl text-neutral-100"
            style={{ fontFamily: "var(--font-blackops)" }}
          >
            {shopName} – Fleet Tower
          </h1>
          <p className="mt-2 max-w-xl text-sm text-neutral-400">
            See out-of-service units, upcoming inspections, pre-trips, and open
            service requests across the fleet. Dispatch, portal, and drivers
            stay in sync from one screen.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={regionFilter}
            onChange={(e) =>
              setRegionFilter(e.target.value as typeof regionFilter)
            }
            className="rounded-xl border border-[color:var(--metal-border-soft)] bg-black/60 px-3 py-2 text-xs text-neutral-200 shadow-[0_12px_35px_rgba(0,0,0,0.85)]"
          >
            <option value="all">All locations</option>
            <option value="Calgary Yard A">Calgary Yard A</option>
            <option value="Edmonton Yard">Edmonton Yard</option>
          </select>

          <span className="accent-chip px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]">
            HD / Fleet Mode
          </span>
        </div>
      </header>

      {/* AI fleet health summary (HD view) */}
      <div className="metal-card rounded-3xl p-4">
        <FleetAISummary shopId={shopId ?? undefined} />
      </div>

      {/* Summary cards: OOS, due, approvals, pretrips */}
      <FleetSummaryCards
        units={filteredUnits}
        issues={mockIssues}
        assignments={mockAssignments}
      />

      {/* Lower layout: left = issues/approvals; right = dispatch + pretrip */}
      <FleetIssueTables
        units={filteredUnits}
        issues={mockIssues}
        assignments={mockAssignments}
      />
    </section>
  );
}