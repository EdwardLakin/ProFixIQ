// features/fleet/components/FleetControlTower.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import FleetSummaryCards from "./FleetSummaryCards";
import FleetIssueTables from "./FleetIssueTables";
import FleetAISummary from "./FleetAISummary";

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
};

type TowerPayload = {
  units: FleetUnit[];
  issues: FleetIssue[];
  assignments: DispatchAssignment[];
};

export default function FleetControlTower({ shopName, shopId }: Props) {
  const [data, setData] = useState<TowerPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [regionFilter, setRegionFilter] = useState<string | "all">("all");

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
          if (!cancelled) {
            setError(
              (body && body.error) ||
                "Failed to load fleet data for this shop.",
            );
          }
          return;
        }

        const body = (await res.json()) as TowerPayload;
        if (!cancelled) {
          setData(body);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[FleetControlTower] fetch error:", err);
        if (!cancelled) {
          setError("Failed to load fleet data.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [shopId]);

  const units = data?.units ?? [];
  const issues = data?.issues ?? [];
  const assignments = data?.assignments ?? [];

  // Regions are inferred from unit.location when present
  const regions = useMemo(() => {
    const set = new Set<string>();
    for (const u of units) {
      if (u.location && u.location.trim().length > 0) {
        set.add(u.location.trim());
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [units]);

  const filteredUnits = useMemo(() => {
    if (regionFilter === "all") return units;
    return units.filter((u) => (u.location ?? "") === regionFilter);
  }, [units, regionFilter]);

  return (
    <section className="space-y-6">
      {/* Top header */}
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">
            Fleet Control
          </p>
          <h1
            className="mt-1 text-3xl text-neutral-100 md:text-4xl"
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
            {regions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>

          <span className="accent-chip px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]">
            HD / Fleet Mode
          </span>
        </div>
      </header>

      {/* Error / loading states */}
      {error && (
        <div className="rounded-2xl border border-red-700 bg-red-900/30 px-4 py-3 text-xs text-red-200">
          {error}
        </div>
      )}

      {loading && !error && (
        <div className="metal-card rounded-3xl px-4 py-4 text-xs text-neutral-400">
          Loading fleet data…
        </div>
      )}

      {!loading && !error && (
        <>
          {/* AI fleet health summary */}
          <div className="metal-card rounded-3xl p-4">
            <FleetAISummary shopId={shopId ?? null} />
          </div>

          {/* Summary cards */}
          <FleetSummaryCards
            units={filteredUnits}
            issues={issues}
            assignments={assignments}
          />

          {/* Issues + dispatch tables */}
          <FleetIssueTables
            units={filteredUnits}
            issues={issues}
            assignments={assignments}
          />
        </>
      )}
    </section>
  );
}