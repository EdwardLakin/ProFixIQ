"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Search, Truck, Wrench } from "lucide-react";
import type { FleetUnitListItem } from "app/api/fleet/units/route";
import type { FleetUiContext } from "@/features/fleet/lib/fleetUiCapabilities";

type Props = {
  uiContext: FleetUiContext;
  routePrefix?: "/fleet" | "/portal/fleet";
  fleetId?: string | null;
};

const panel =
  "rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)]";

function meter(unit: FleetUnitListItem) {
  const parts = [
    unit.currentOdometerKm == null
      ? null
      : `${unit.currentOdometerKm.toLocaleString()} km`,
    unit.currentEngineHours == null
      ? null
      : `${unit.currentEngineHours.toLocaleString()} hours`,
  ].filter(Boolean);
  return parts.join(" • ") || "No reading";
}

function StatusPill({ status }: { status: FleetUnitListItem["status"] }) {
  const styles = {
    in_service: "bg-emerald-400/10 text-emerald-200",
    limited: "bg-amber-300/10 text-amber-100",
    oos: "bg-red-400/10 text-red-200",
  };
  const labels = {
    in_service: "In service",
    limited: "Limited",
    oos: "Out of service",
  };
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}

export default function FleetUnitsPage({
  uiContext,
  routePrefix = "/portal/fleet",
  fleetId,
}: Props) {
  const pathname = usePathname() ?? "";
  const productRoutes =
    routePrefix === "/portal/fleet" && !pathname.startsWith("/portal/fleet");
  const isDriver = uiContext.actorType === "fleet_driver";
  const [units, setUnits] = useState<FleetUnitListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [fleetFilter, setFleetFilter] = useState("all");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/fleet/units", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fleetId: fleetId ?? null }),
          cache: "no-store",
        });
        const body = (await response.json().catch(() => ({}))) as {
          units?: FleetUnitListItem[];
          error?: string;
        };
        if (!response.ok)
          throw new Error(body.error || "Unable to load fleet units");
        if (!cancelled) setUnits(body.units ?? []);
      } catch (cause) {
        if (!cancelled) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Unable to load fleet units",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fleetId]);

  const fleets = useMemo(
    () =>
      Array.from(
        new Set(
          units
            .map((unit) => unit.fleetName)
            .filter((value): value is string => Boolean(value)),
        ),
      ).sort(),
    [units],
  );

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return units.filter((unit) => {
      if (fleetFilter !== "all" && unit.fleetName !== fleetFilter) return false;
      if (!needle) return true;
      return [unit.label, unit.fleetName, unit.plate, unit.vin]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [fleetFilter, search, units]);

  const attention = units.filter(
    (unit) =>
      unit.status !== "in_service" ||
      unit.pmDueCount > 0 ||
      unit.openRequestCount > 0,
  ).length;

  return (
    <main className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 text-[color:var(--theme-text-primary)]">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">
          Fleet units
        </p>
        <h1 className="mt-2 text-2xl font-semibold">
          {isDriver ? "My assigned assets" : "Every unit, one record"}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-[color:var(--theme-text-secondary)]">
          {isDriver
            ? "See the units dispatch has assigned to you and start the correct inspection."
            : "Open any unit for PM, service history, requests, approvals, invoices, readings, pre-trips, and repair evidence."}
        </p>
        <p className="mt-1 text-[10px] text-[color:var(--theme-text-muted)]">
          {uiContext.actorLabel}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href={
              productRoutes ? "/pre-trips" : `${routePrefix}/pretrip-history`
            }
            className="inline-flex min-h-10 items-center rounded-xl border border-[color:var(--theme-border-soft)] px-3 py-2 text-xs font-semibold text-sky-300 hover:bg-sky-300/10"
          >
            {isDriver ? "My pre-trip history" : "Fleet-wide pre-trip history"}
          </Link>
          {uiContext.capabilities.canManageUnits ? (
            <Link
              href={
                routePrefix === "/fleet" ? "/fleet/units/new" : "/assets/new"
              }
              className="inline-flex min-h-10 items-center rounded-xl bg-sky-300 px-3 py-2 text-xs font-semibold text-slate-950"
            >
              Enroll units & assign drivers
            </Link>
          ) : null}
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        {!isDriver ? (
          <div className={`${panel} p-4`}>
            <Truck size={17} className="text-sky-300" />
            <div className="mt-3 text-2xl font-semibold">{units.length}</div>
            <div className="text-xs text-[color:var(--theme-text-muted)]">
              Active units
            </div>
          </div>
        ) : null}
        <div className={`${panel} p-4`}>
          <Wrench size={17} className="text-amber-200" />
          <div className="mt-3 text-2xl font-semibold">{attention}</div>
          <div className="text-xs text-[color:var(--theme-text-muted)]">
            Need attention
          </div>
        </div>
        <div className={`${panel} p-4`}>
          <div className="text-xs uppercase tracking-wide text-[color:var(--theme-text-muted)]">
            Navigation rule
          </div>
          <div className="mt-2 text-sm font-semibold">
            {isDriver
              ? "Fast inspection access"
              : "Everything is inside the unit"}
          </div>
          <div className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
            {isDriver
              ? "Choose an assigned unit and report only what you see."
              : "Select a unit once; its full record is one click away."}
          </div>
        </div>
      </section>

      <section className={`${panel} overflow-hidden`}>
        <div className="grid gap-3 border-b border-[color:var(--theme-border-soft)] p-3 sm:grid-cols-[1fr_220px]">
          <label className="relative">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--theme-text-muted)]"
            />
            <span className="sr-only">Search units</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search unit, plate, or VIN"
              className="h-10 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] pl-9 pr-3 text-sm outline-none"
            />
          </label>
          <label>
            <span className="sr-only">Filter by fleet</span>
            <select
              value={fleetFilter}
              onChange={(event) => setFleetFilter(event.target.value)}
              className="h-10 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3 text-sm"
            >
              <option value="all">All fleets</option>
              {fleets.map((fleet) => (
                <option key={fleet} value={fleet}>
                  {fleet}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error ? <p className="p-5 text-sm text-red-300">{error}</p> : null}
        {loading ? (
          <p className="p-5 text-sm text-[color:var(--theme-text-secondary)]">
            Loading units…
          </p>
        ) : null}
        {!loading && !error && visible.length === 0 ? (
          <p className="p-8 text-center text-sm text-[color:var(--theme-text-secondary)]">
            No units match this view.
          </p>
        ) : null}

        <div className="divide-y divide-[color:var(--theme-border-soft)]">
          {visible.map((unit) => (
            <div
              key={`${unit.fleetId}:${unit.id}`}
              className="grid gap-3 p-4 transition hover:bg-white/[0.03] md:grid-cols-[minmax(180px,1.1fr)_minmax(120px,.7fr)_minmax(160px,1fr)_minmax(150px,.8fr)_auto] md:items-center"
            >
              <div>
                <div className="font-semibold text-sky-300">{unit.label}</div>
                <div className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
                  {unit.plate ?? "No plate"} • {unit.fleetName ?? "Fleet"}
                </div>
              </div>
              <StatusPill status={unit.status} />
              {!isDriver ? (
                <>
                  <div className="text-xs text-[color:var(--theme-text-secondary)]">
                    <div className="font-medium text-[color:var(--theme-text-primary)]">
                      Latest reading
                    </div>
                    <div className="mt-1">{meter(unit)}</div>
                  </div>
                  <div className="text-xs text-[color:var(--theme-text-secondary)]">
                    <div>{unit.pmDueCount} PM due</div>
                    <div className="mt-1">
                      {unit.openRequestCount} open requests
                    </div>
                  </div>
                </>
              ) : null}
              {isDriver ? (
                <Link
                  href={`${productRoutes ? "/pre-trips/start" : "/portal/fleet/pretrip"}/${encodeURIComponent(unit.id)}?fleetId=${encodeURIComponent(unit.fleetId)}`}
                  className="text-xs font-semibold text-sky-300"
                >
                  Start inspection →
                </Link>
              ) : uiContext.capabilities.canViewUnitMaintenanceRecord ? (
                <Link
                  href={`${
                    productRoutes
                      ? `/assets/${encodeURIComponent(unit.id)}`
                      : `${routePrefix}/units/${encodeURIComponent(unit.id)}`
                  }?fleetId=${encodeURIComponent(unit.fleetId)}`}
                  className="text-xs font-semibold text-sky-300"
                >
                  Open unit →
                </Link>
              ) : (
                <span className="text-xs font-semibold text-[color:var(--theme-text-muted)]">
                  Readiness only
                </span>
              )}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
