"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  ClipboardCheck,
  RefreshCw,
  Route,
  Search,
  Truck,
  UserPlus,
  UsersRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Fleet = { id: string; name: string };
type Driver = { fleetId: string; id: string; name: string };
type Vehicle = {
  id: string;
  unitNumber: string | null;
  vin: string | null;
  licensePlate: string | null;
  description: string;
};
type Enrollment = {
  fleetId: string;
  vehicleId: string;
  nickname: string | null;
  active: boolean;
};
type Assignment = {
  id: string;
  fleetId: string;
  vehicleId: string;
  driverProfileId: string;
  driverName: string;
  routeLabel: string | null;
  nextPretripDue: string | null;
  state: string;
};
type DriverContext = {
  fleets: Fleet[];
  vehicles: Vehicle[];
  drivers: Driver[];
  enrollments: Enrollment[];
  assignments: Assignment[];
};

const panel =
  "rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] shadow-[var(--theme-shadow-soft)]";

function dueLabel(value: string | null): string {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not scheduled";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function stateLabel(value: string): string {
  if (value === "pretrip_due") return "Pre-trip due";
  if (value === "en_route") return "En route";
  if (value === "in_shop") return "In shop";
  return value.replaceAll("_", " ");
}

export default function FleetDriversWorkspace({
  actorLabel,
  canInviteDrivers,
}: {
  actorLabel: string;
  canInviteDrivers: boolean;
}) {
  const pathname = usePathname() ?? "";
  const internalRoutes = pathname.startsWith("/portal/fleet");
  const [context, setContext] = useState<DriverContext | null>(null);
  const [fleetId, setFleetId] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/fleet/enrollment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "context" }),
        cache: "no-store",
      });
      const body = (await response.json().catch(() => ({}))) as
        | DriverContext
        | { error?: string };
      if (!response.ok || !("drivers" in body)) {
        throw new Error(
          "error" in body && body.error
            ? body.error
            : "Driver operations could not be loaded.",
        );
      }
      setContext(body);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Driver operations could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const assignments = useMemo(
    () =>
      (context?.assignments ?? []).filter(
        (assignment) => fleetId === "all" || assignment.fleetId === fleetId,
      ),
    [context?.assignments, fleetId],
  );
  const drivers = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (context?.drivers ?? []).filter((driver) => {
      if (fleetId !== "all" && driver.fleetId !== fleetId) return false;
      if (!needle) return true;
      const assigned = assignments.filter(
        (assignment) => assignment.driverProfileId === driver.id,
      );
      return [
        driver.name,
        ...assigned.flatMap((assignment) => [
          assignment.driverName,
          assignment.routeLabel,
          assignment.state,
        ]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [assignments, context?.drivers, fleetId, search]);
  const enrollments = (context?.enrollments ?? []).filter(
    (enrollment) =>
      enrollment.active &&
      (fleetId === "all" || enrollment.fleetId === fleetId),
  );
  const assignedVehicleIds = new Set(
    assignments.map((assignment) => assignment.vehicleId),
  );
  const unassignedUnits = enrollments.filter(
    (enrollment) => !assignedVehicleIds.has(enrollment.vehicleId),
  ).length;
  const duePretrips = assignments.filter(
    (assignment) => assignment.state === "pretrip_due",
  ).length;
  const vehicleMap = new Map(
    (context?.vehicles ?? []).map((vehicle) => [vehicle.id, vehicle]),
  );
  const fleetMap = new Map(
    (context?.fleets ?? []).map((fleet) => [fleet.id, fleet.name]),
  );
  const assignmentHref = internalRoutes
    ? "/portal/fleet/units/new"
    : "/assets/new";
  const pretripHref = internalRoutes
    ? "/portal/fleet/pretrip-history"
    : "/pre-trips";
  const assetHref = (vehicleId: string) =>
    internalRoutes
      ? `/portal/fleet/units/${encodeURIComponent(vehicleId)}`
      : `/assets/${encodeURIComponent(vehicleId)}`;

  return (
    <div className="space-y-5 text-[color:var(--theme-text-primary)]">
      <header className={`${panel} overflow-hidden p-5 sm:p-6`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">
              Fleet operations
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">
              Drivers & assignments
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[color:var(--theme-text-secondary)]">
              Keep driver access, assigned assets, routes, and daily pre-trip
              responsibility in one Fleet-owned workspace.
            </p>
            <p className="mt-2 text-[10px] text-[color:var(--theme-text-muted)]">
              {actorLabel}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={assignmentHref}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-sky-300/40 px-3 py-2 text-xs font-semibold text-sky-300"
            >
              <Route className="h-4 w-4" aria-hidden="true" />
              Assign assets
            </Link>
            {canInviteDrivers ? (
              <a
                href="#driver-access"
                className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-sky-300 px-3 py-2 text-xs font-semibold text-slate-950"
              >
                <UserPlus className="h-4 w-4" aria-hidden="true" />
                Invite driver
              </a>
            ) : null}
          </div>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {(
          [
            ["Active drivers", context?.drivers.length ?? 0, UsersRound],
            ["Assigned units", assignments.length, Truck],
            ["Pre-trips due", duePretrips, ClipboardCheck],
            ["Unassigned units", unassignedUnits, CalendarClock],
          ] satisfies Array<[string, number, LucideIcon]>
        ).map(([label, value, Icon]) => (
          <div key={String(label)} className={`${panel} p-4`}>
            <Icon className="h-4 w-4 text-sky-300" aria-hidden="true" />
            <div className="mt-3 text-2xl font-semibold">{String(value)}</div>
            <div className="text-xs text-[color:var(--theme-text-muted)]">
              {String(label)}
            </div>
          </div>
        ))}
      </section>

      <section className={`${panel} overflow-hidden`}>
        <div className="grid gap-3 border-b border-[color:var(--theme-border-soft)] p-4 sm:grid-cols-[1fr_220px_auto]">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--theme-text-muted)]" />
            <span className="sr-only">Search drivers</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search driver, route, or status"
              className="h-10 w-full rounded-xl border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] pl-9 pr-3 text-sm"
            />
          </label>
          <label>
            <span className="sr-only">Filter drivers by fleet</span>
            <select
              value={fleetId}
              onChange={(event) => setFleetId(event.target.value)}
              className="h-10 w-full rounded-xl border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-3 text-sm"
            >
              <option value="all">All fleets</option>
              {(context?.fleets ?? []).map((fleet) => (
                <option key={fleet.id} value={fleet.id}>
                  {fleet.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] px-3 text-xs font-semibold disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {error ? (
          <div
            role="alert"
            className="m-4 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200"
          >
            {error}
          </div>
        ) : null}
        {loading && !context ? (
          <div
            role="status"
            className="p-8 text-center text-sm text-[color:var(--theme-text-secondary)]"
          >
            Loading driver operations…
          </div>
        ) : null}
        {!loading && !error && drivers.length === 0 ? (
          <div className="p-8 text-center">
            <UsersRound className="mx-auto h-7 w-7 text-sky-300" />
            <h2 className="mt-3 font-semibold">No drivers match this view</h2>
            <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
              Invite a driver, then assign an enrolled asset to activate daily
              pre-trip tracking.
            </p>
          </div>
        ) : null}

        {drivers.length ? (
          <div className="divide-y divide-[color:var(--theme-border-soft)]">
            {drivers.map((driver) => {
              const driverAssignments = assignments.filter(
                (assignment) => assignment.driverProfileId === driver.id,
              );
              return (
                <article
                  key={`${driver.fleetId}:${driver.id}`}
                  className="p-4 sm:p-5"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-sm font-semibold">
                          {driver.name}
                        </h2>
                        <span className="rounded-full bg-emerald-400/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-200">
                          Active
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
                        {fleetMap.get(driver.fleetId) ?? "Fleet"} · Fleet driver
                      </p>
                    </div>
                    <div className="text-xs text-[color:var(--theme-text-secondary)]">
                      {driverAssignments.length
                        ? `${driverAssignments.length} assigned asset${driverAssignments.length === 1 ? "" : "s"}`
                        : "Awaiting asset assignment"}
                    </div>
                  </div>

                  {driverAssignments.length ? (
                    <div className="mt-4 grid gap-3 lg:grid-cols-2">
                      {driverAssignments.map((assignment) => {
                        const vehicle = vehicleMap.get(assignment.vehicleId);
                        const enrollment = context?.enrollments.find(
                          (row) =>
                            row.fleetId === assignment.fleetId &&
                            row.vehicleId === assignment.vehicleId,
                        );
                        const unitLabel =
                          enrollment?.nickname ||
                          vehicle?.unitNumber ||
                          vehicle?.licensePlate ||
                          vehicle?.vin ||
                          "Unit";
                        return (
                          <div
                            key={assignment.id}
                            className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <Link
                                  href={assetHref(assignment.vehicleId)}
                                  className="text-sm font-semibold hover:underline"
                                >
                                  {unitLabel}
                                </Link>
                                <div className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
                                  {vehicle?.description || "Fleet asset"}
                                </div>
                              </div>
                              <span className="rounded-full border border-sky-300/25 bg-sky-300/10 px-2 py-1 text-[10px] font-semibold text-sky-200">
                                {stateLabel(assignment.state)}
                              </span>
                            </div>
                            <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                              <div>
                                <div className="text-[color:var(--theme-text-muted)]">
                                  Route / location
                                </div>
                                <div className="mt-0.5 font-medium">
                                  {assignment.routeLabel || "Not set"}
                                </div>
                              </div>
                              <div>
                                <div className="text-[color:var(--theme-text-muted)]">
                                  Next pre-trip
                                </div>
                                <div className="mt-0.5 font-medium">
                                  {dueLabel(assignment.nextPretripDue)}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : null}
      </section>

      <div className="flex justify-end">
        <Link
          href={pretripHref}
          className="text-xs font-semibold text-sky-300 hover:underline"
        >
          Review fleet-wide pre-trip compliance
        </Link>
      </div>
    </div>
  );
}
