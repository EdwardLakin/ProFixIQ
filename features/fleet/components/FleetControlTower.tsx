"use client";

import { useEffect, useMemo, useState } from "react";
import FleetSummaryCards from "./FleetSummaryCards";
import FleetIssueTables from "./FleetIssueTables";
import FleetAISummary from "./FleetAISummary";
import WorkOrderBoardWidget from "@shared/components/workboard/WorkOrderBoardWidget";
import Link from "next/link";
import type { FleetUiContext } from "@/features/fleet/lib/fleetUiCapabilities";
import {
  MaintenanceControlTower,
  getOperationsVerticalConfig,
} from "@/features/operations";
import {
  mapDispatchAssignmentToOperationsAssignment,
  mapFleetIssueToOperationsIssue,
  mapFleetUnitToOperationsAsset,
} from "@/features/fleet/lib/fleetOperationsAdapters";

export type FleetUnitStatus = "in_service" | "limited" | "oos";

export type FleetUnit = {
  id: string;
  label: string;
  plate?: string | null;
  vin?: string | null;
  class?: string | null;
  location?: string | null;
  status: FleetUnitStatus;
  nextInspectionDate?: string | null;
};

export type FleetIssue = {
  id: string;
  unitId: string;
  unitLabel: string;
  severity: "safety" | "compliance" | "recommend";
  summary: string;
  createdAt: string;
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
  uiContext: FleetUiContext;
  routePrefix?: "/fleet" | "/portal/fleet";
};

type TowerPayload = {
  units: FleetUnit[];
  issues: FleetIssue[];
  assignments: DispatchAssignment[];
};

type FocusFilter = "all" | "inspection_due_30";

function isDueInNextDays(nextInspectionDate?: string | null, days = 30) {
  if (!nextInspectionDate) return false;
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const next = new Date(nextInspectionDate);
  const msPerDay = 1000 * 60 * 60 * 24;
  const diffDays = Math.floor((next.getTime() - startOfToday.getTime()) / msPerDay);
  return diffDays >= 0 && diffDays <= days;
}

export default function FleetControlTower({
  shopName,
  shopId,
  uiContext,
  routePrefix = "/fleet",
}: Props) {
  const [data, setData] = useState<TowerPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [regionFilter, setRegionFilter] = useState<string | "all">("all");
  const [focusFilter, setFocusFilter] = useState<FocusFilter>("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch("/api/fleet/tower", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shopId: shopId ?? null }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          if (!cancelled) setError((body && body.error) || "Failed to load fleet data for this shop.");
          return;
        }
        const body = (await res.json()) as TowerPayload;
        if (!cancelled) setData(body);
      } catch (err) {
        console.error("[FleetControlTower] fetch error:", err);
        if (!cancelled) setError("Failed to load fleet data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shopId]);

  const units = useMemo(() => data?.units ?? [], [data?.units]);
  const issues = useMemo(() => data?.issues ?? [], [data?.issues]);
  const assignments = useMemo(() => data?.assignments ?? [], [data?.assignments]);
  const isExternal = !uiContext.isInternal;

  const regions = useMemo(() => {
    const set = new Set<string>();
    for (const u of units) if (u.location?.trim()) set.add(u.location.trim());
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [units]);

  const filteredUnits = useMemo(() => {
    let list = units;
    if (regionFilter !== "all") list = list.filter((u) => (u.location ?? "") === regionFilter);
    if (focusFilter === "inspection_due_30") list = list.filter((u) => isDueInNextDays(u.nextInspectionDate, 30));
    return list;
  }, [units, regionFilter, focusFilter]);

  const handleInspectionWindowClick = () => setFocusFilter((prev) => (prev === "inspection_due_30" ? "all" : "inspection_due_30"));

  useMemo(() => ({
    assets: filteredUnits.map(mapFleetUnitToOperationsAsset),
    issues: issues.map(mapFleetIssueToOperationsIssue),
    assignments: assignments.map(mapDispatchAssignmentToOperationsAssignment),
  }), [filteredUnits, issues, assignments]);
  const terminology = getOperationsVerticalConfig("fleet")?.terminology;

  return (
    <MaintenanceControlTower
      headerLabel="Fleet Control"
      modeLabel="HD / Fleet Mode"
      title={`${shopName} – Fleet Tower`}
      subtitle={
        isExternal
          ? "Track unit readiness, open requests, and pre-trip outcomes for your fleet scope. Dispatch, portal, and drivers stay in sync from one screen."
          : "See out-of-service units, upcoming inspections, pre-trips, and open service requests across the fleet. Dispatch, portal, and drivers stay in sync from one screen."
      }
      actorSurfaceLabel={uiContext.actorLabel}
      locationFilter={{
        value: regionFilter,
        options: regions,
        onChange: (value) => setRegionFilter(value as typeof regionFilter),
      }}
      focusFilter={{
        active: focusFilter === "inspection_due_30",
        label: `${terminology?.inspectionPluralLabel ?? "Inspections"} due in next 30 days`,
        onClear: () => setFocusFilter("all"),
      }}
      workOrderBoard={
        uiContext.capabilities.canViewDispatch ? (
          <div className="metal-card rounded-3xl p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--theme-text-muted)]">Work board</div>
                <div className="mt-1 text-sm font-semibold text-[color:var(--theme-text-primary)]">Fleet jobs in progress</div>
              </div>
              <Link href={`${routePrefix}/board`} className="text-xs text-[color:var(--theme-text-secondary)] underline decoration-[color:var(--theme-border-strong)] underline-offset-4 hover:text-[color:var(--theme-text-primary)]">
                Open full board →
              </Link>
            </div>
            <WorkOrderBoardWidget variant="fleet" href={`${routePrefix}/board`} />
          </div>
        ) : null
      }
      error={
        error ? (
          <div className="rounded-2xl border border-red-700 bg-red-900/30 px-4 py-3 text-xs text-red-200">{error}</div>
        ) : null
      }
      loading={<div className="metal-card rounded-3xl px-4 py-4 text-xs text-[color:var(--theme-text-secondary)]">Loading fleet data…</div>}
      isLoading={loading && !error}
      aiSummary={
        <div className="metal-card rounded-3xl p-4">
          <FleetAISummary shopId={shopId ?? null} />
        </div>
      }
      summaryCards={
        <FleetSummaryCards
          units={filteredUnits}
          issues={issues}
          assignments={assignments}
          onClickInspectionWindow={handleInspectionWindowClick}
          inspectionWindowActive={focusFilter === "inspection_due_30"}
        />
      }
      issueTables={
        <FleetIssueTables
          units={filteredUnits}
          issues={issues}
          assignments={assignments}
          uiContext={uiContext}
          routePrefix={routePrefix}
        />
      }
    />
  );
}
