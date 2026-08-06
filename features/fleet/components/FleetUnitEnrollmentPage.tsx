"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Truck, UserRoundCheck } from "lucide-react";

type Fleet = { id: string; name: string };
type Vehicle = {
  id: string;
  unitNumber: string | null;
  vin: string | null;
  licensePlate: string | null;
  description: string;
};
type Driver = { fleetId: string; id: string; name: string };
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
type Context = {
  canEnrollExisting: boolean;
  fleets: Fleet[];
  vehicles: Vehicle[];
  drivers: Driver[];
  enrollments: Enrollment[];
  assignments: Assignment[];
};

const panel =
  "rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4";

function vehicleLabel(vehicle: Vehicle | undefined) {
  if (!vehicle) return "Unit";
  return [
    vehicle.unitNumber || vehicle.licensePlate || vehicle.vin || "Unit",
    vehicle.description,
  ]
    .filter(Boolean)
    .join(" • ");
}

export default function FleetUnitEnrollmentPage({
  routePrefix = "/fleet",
}: {
  routePrefix?: "/fleet" | "/portal/fleet";
}) {
  const [context, setContext] = useState<Context | null>(null);
  const [fleetId, setFleetId] = useState("");
  const [mode, setMode] = useState<"existing" | "new">("new");
  const [search, setSearch] = useState("");
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState("");
  const [nickname, setNickname] = useState("");
  const [unitNumber, setUnitNumber] = useState("");
  const [vin, setVin] = useState("");
  const [plate, setPlate] = useState("");
  const [year, setYear] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [driverByVehicle, setDriverByVehicle] = useState<
    Record<string, string>
  >({});
  const [routeByVehicle, setRouteByVehicle] = useState<Record<string, string>>(
    {},
  );
  const [dueByVehicle, setDueByVehicle] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/fleet/enrollment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "context" }),
      cache: "no-store",
    });
    const body = (await response.json().catch(() => ({}))) as Context & {
      error?: string;
    };
    if (!response.ok)
      throw new Error(body.error || "Unable to load fleet setup");
    setContext(body);
    setVehicles(body.vehicles);
    setMode(body.canEnrollExisting ? "existing" : "new");
    setFleetId((current) => current || body.fleets[0]?.id || "");
  }, []);

  useEffect(() => {
    void load().catch((error) =>
      setMessage(
        error instanceof Error ? error.message : "Unable to load fleet setup",
      ),
    );
  }, [load]);

  useEffect(() => {
    if (!context?.canEnrollExisting) return;
    const timer = window.setTimeout(() => {
      void fetch("/api/fleet/enrollment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "search_vehicles", query: search }),
        cache: "no-store",
      })
        .then(async (response) => {
          const body = (await response.json().catch(() => ({}))) as {
            vehicles?: Vehicle[];
            error?: string;
          };
          if (!response.ok)
            throw new Error(body.error || "Vehicle search failed");
          setVehicles(body.vehicles ?? []);
        })
        .catch((error) =>
          setMessage(
            error instanceof Error ? error.message : "Vehicle search failed",
          ),
        );
    }, 250);
    return () => window.clearTimeout(timer);
  }, [context, search]);

  const enrolled = useMemo(
    () =>
      context?.enrollments.filter(
        (row) => row.fleetId === fleetId && row.active,
      ) ?? [],
    [context, fleetId],
  );
  const vehicleMap = useMemo(
    () =>
      new Map(
        [...(context?.vehicles ?? []), ...vehicles].map((vehicle) => [
          vehicle.id,
          vehicle,
        ]),
      ),
    [context?.vehicles, vehicles],
  );
  const drivers =
    context?.drivers.filter((driver) => driver.fleetId === fleetId) ?? [];

  async function mutate(
    action: "enroll_existing" | "create_and_enroll" | "assign",
    extra: Record<string, unknown>,
  ) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/fleet/enrollment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          fleetId,
          nickname: nickname || null,
          ...extra,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok)
        throw new Error(body.error || "Fleet setup update failed");
      setMessage(
        action === "assign"
          ? "Driver assignment saved. Daily pre-trip tracking is active."
          : "Unit enrolled in the fleet.",
      );
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Fleet setup update failed",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!context) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-6 text-sm">
        Loading fleet setup…
      </main>
    );
  }

  if (context.fleets.length === 0) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-10 text-[color:var(--theme-text-primary)]">
        <section className={`${panel} text-center`}>
          <Truck className="mx-auto h-8 w-8 text-sky-300" />
          <h1 className="mt-3 text-2xl font-semibold">
            Create your first fleet
          </h1>
          <p className="mx-auto mt-2 max-w-xl text-sm text-[color:var(--theme-text-secondary)]">
            A fleet is required before units can be enrolled or drivers
            assigned.
          </p>
          <Link
            href={
              routePrefix === "/fleet"
                ? "/fleet/programs?returnTo=%2Ffleet%2Funits%2Fnew"
                : "/settings"
            }
            className="mt-5 inline-flex rounded-xl bg-sky-300 px-4 py-2.5 text-sm font-semibold text-slate-950"
          >
            {routePrefix === "/fleet" ? "Create fleet" : "Open Fleet settings"}
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 text-[color:var(--theme-text-primary)]">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">
            Fleet setup
          </p>
          <h1 className="mt-1 text-2xl font-semibold">
            Enroll units & assign drivers
          </h1>
          <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
            Pick a fleet, add the unit, then assign its driver. Both jobs stay
            on this one page.
          </p>
        </div>
        <Link
          href={routePrefix === "/fleet" ? "/fleet/units" : "/assets"}
          className="rounded-xl border border-[color:var(--theme-border-soft)] px-3 py-2 text-xs font-semibold"
        >
          Back to assets
        </Link>
      </header>

      <section className={panel}>
        <label className="block max-w-md text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">
          Fleet
          <select
            value={fleetId}
            onChange={(event) => setFleetId(event.target.value)}
            className="mt-1 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] px-3 py-2 text-sm normal-case tracking-normal"
          >
            {context.fleets.map((fleet) => (
              <option key={fleet.id} value={fleet.id}>
                {fleet.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className={panel}>
          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-sky-300" />
            <h2 className="font-semibold">1. Enroll a unit</h2>
          </div>
          <div className="mt-3 flex gap-2">
            {context.canEnrollExisting ? (
              <button
                type="button"
                onClick={() => setMode("existing")}
                className={`rounded-xl px-3 py-2 text-xs font-semibold ${mode === "existing" ? "bg-sky-300 text-slate-950" : "border border-[color:var(--theme-border-soft)]"}`}
              >
                Existing vehicle
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setMode("new")}
              className={`rounded-xl px-3 py-2 text-xs font-semibold ${mode === "new" ? "bg-sky-300 text-slate-950" : "border border-[color:var(--theme-border-soft)]"}`}
            >
              New vehicle
            </button>
          </div>

          {mode === "existing" ? (
            <div className="mt-4 space-y-3">
              <label className="relative block">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-[color:var(--theme-text-muted)]" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search unit number, VIN, plate, make or model"
                  className="w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] py-2 pl-9 pr-3 text-sm"
                />
              </label>
              <select
                value={vehicleId}
                onChange={(event) => setVehicleId(event.target.value)}
                size={8}
                className="w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] p-2 text-sm"
              >
                {vehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicleLabel(vehicle)}
                  </option>
                ))}
              </select>
              <input
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                placeholder="Fleet nickname (optional)"
                className="w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] px-3 py-2 text-sm"
              />
              <button
                disabled={busy || !fleetId || !vehicleId}
                onClick={() => void mutate("enroll_existing", { vehicleId })}
                className="w-full rounded-xl bg-sky-300 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-60"
              >
                Enroll selected vehicle
              </button>
            </div>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <input
                value={unitNumber}
                onChange={(event) => setUnitNumber(event.target.value)}
                placeholder="Unit number"
                className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] px-3 py-2 text-sm"
              />
              <input
                value={plate}
                onChange={(event) => setPlate(event.target.value)}
                placeholder="Plate"
                className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] px-3 py-2 text-sm"
              />
              <input
                value={vin}
                onChange={(event) => setVin(event.target.value)}
                placeholder="VIN"
                className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] px-3 py-2 text-sm sm:col-span-2"
              />
              <input
                type="number"
                value={year}
                onChange={(event) => setYear(event.target.value)}
                placeholder="Year"
                className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] px-3 py-2 text-sm"
              />
              <input
                value={make}
                onChange={(event) => setMake(event.target.value)}
                placeholder="Make"
                className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] px-3 py-2 text-sm"
              />
              <input
                value={model}
                onChange={(event) => setModel(event.target.value)}
                placeholder="Model"
                className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] px-3 py-2 text-sm"
              />
              <input
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                placeholder="Fleet nickname"
                className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] px-3 py-2 text-sm"
              />
              <button
                disabled={busy || !fleetId || (!unitNumber && !vin && !plate)}
                onClick={() =>
                  void mutate("create_and_enroll", {
                    unitNumber,
                    vin,
                    licensePlate: plate,
                    year: year ? Number(year) : null,
                    make,
                    model,
                  })
                }
                className="rounded-xl bg-sky-300 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-60 sm:col-span-2"
              >
                Create & enroll unit
              </button>
            </div>
          )}
        </section>

        <section className={panel}>
          <div className="flex items-center gap-2">
            <UserRoundCheck className="h-4 w-4 text-sky-300" />
            <h2 className="font-semibold">2. Assign drivers</h2>
          </div>
          <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
            A driver must be invited to this fleet before assignment.
          </p>
          <div className="mt-4 space-y-3">
            {enrolled.map((row) => {
              const assignment = context.assignments.find(
                (item) =>
                  item.fleetId === fleetId && item.vehicleId === row.vehicleId,
              );
              return (
                <div
                  key={row.vehicleId}
                  className="rounded-xl border border-[color:var(--theme-border-soft)] p-3"
                >
                  <div className="text-sm font-semibold">
                    {row.nickname ||
                      vehicleLabel(vehicleMap.get(row.vehicleId))}
                  </div>
                  {assignment ? (
                    <div className="mt-1 text-xs text-emerald-200">
                      Assigned to {assignment.driverName} •{" "}
                      {assignment.state.replaceAll("_", " ")}
                    </div>
                  ) : (
                    <div className="mt-1 text-xs text-amber-100">
                      Driver not assigned
                    </div>
                  )}
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <select
                      value={
                        driverByVehicle[row.vehicleId] ??
                        assignment?.driverProfileId ??
                        ""
                      }
                      onChange={(event) =>
                        setDriverByVehicle((current) => ({
                          ...current,
                          [row.vehicleId]: event.target.value,
                        }))
                      }
                      className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] px-2 py-2 text-xs"
                    >
                      <option value="">Select driver</option>
                      {drivers.map((driver) => (
                        <option key={driver.id} value={driver.id}>
                          {driver.name}
                        </option>
                      ))}
                    </select>
                    <input
                      value={
                        routeByVehicle[row.vehicleId] ??
                        assignment?.routeLabel ??
                        ""
                      }
                      onChange={(event) =>
                        setRouteByVehicle((current) => ({
                          ...current,
                          [row.vehicleId]: event.target.value,
                        }))
                      }
                      placeholder="Route / location"
                      className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] px-2 py-2 text-xs"
                    />
                    <input
                      type="time"
                      value={dueByVehicle[row.vehicleId] ?? "07:00"}
                      onChange={(event) =>
                        setDueByVehicle((current) => ({
                          ...current,
                          [row.vehicleId]: event.target.value,
                        }))
                      }
                      className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] px-2 py-2 text-xs"
                    />
                  </div>
                  <button
                    disabled={
                      busy ||
                      !(
                        driverByVehicle[row.vehicleId] ??
                        assignment?.driverProfileId
                      )
                    }
                    onClick={() =>
                      void mutate("assign", {
                        vehicleId: row.vehicleId,
                        driverProfileId:
                          driverByVehicle[row.vehicleId] ??
                          assignment?.driverProfileId,
                        nickname: row.nickname,
                        routeLabel:
                          routeByVehicle[row.vehicleId] ??
                          assignment?.routeLabel ??
                          null,
                        pretripDueLocalTime:
                          dueByVehicle[row.vehicleId] ?? "07:00",
                      })
                    }
                    className="mt-2 rounded-xl border border-sky-300/40 px-3 py-2 text-xs font-semibold text-sky-200 disabled:opacity-50"
                  >
                    Save assignment & daily pre-trip
                  </button>
                </div>
              );
            })}
            {!enrolled.length ? (
              <p className="text-sm text-[color:var(--theme-text-secondary)]">
                Enroll a unit first; it appears here immediately.
              </p>
            ) : null}
          </div>
        </section>
      </div>

      {message ? (
        <p
          role="status"
          className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3 text-sm"
        >
          {message}
        </p>
      ) : null}
    </main>
  );
}
