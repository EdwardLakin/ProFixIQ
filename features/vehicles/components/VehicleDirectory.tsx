"use client";

import React from "react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { formatVehicleIdentifier, formatVehicleYearMakeModel, normalizeVehicleIdentifier, normalizeVehicleText } from "@/features/vehicles/lib/display";
import { filterSortAndCapVehicles, type VehicleListRow } from "@/features/vehicles/lib/list";

type Props = {
  vehicles: VehicleListRow[];
  vehicleError?: string | null;
  initialQuery?: string;
};

function vehicleCustomerDisplay(vehicle: VehicleListRow): string {
  if (vehicle.customerName) return vehicle.customerName;
  return vehicle.customer_id ? "Customer link missing" : "No customer linked";
}

export function VehicleDirectory({ vehicles: sourceVehicles, vehicleError = null, initialQuery = "" }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const vehicles = useMemo(() => filterSortAndCapVehicles(sourceVehicles, query), [sourceVehicles, query]);

  return (
    <section className="rounded-2xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-panel-bg-soft)] p-4 shadow-[0_18px_45px_rgba(0,0,0,0.45)]">
      <form className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" onSubmit={(event) => event.preventDefault()}>
        <div>
          <h2 className="text-lg font-semibold text-white">Vehicle directory</h2>
          <p className="mt-1 text-sm text-neutral-400">Showing current-shop vehicles only.</p>
        </div>
        <input
          name="q"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="Search VIN, plate, unit, YMM, customer, external ID…"
          className="w-full rounded-xl border border-[color:var(--desktop-border)] bg-black/25 px-3 py-2 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-[var(--accent-copper-soft)] sm:max-w-md"
        />
      </form>

      {vehicleError ? <div className="mt-4 rounded-xl border border-red-500/30 bg-red-950/25 p-3 text-sm text-red-100">Unable to load vehicles right now.</div> : null}

      {!vehicleError && vehicles.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-[color:var(--desktop-border)] bg-black/20 p-8 text-center">
          <h3 className="text-xl font-semibold text-white">No vehicles yet</h3>
          <p className="mx-auto mt-2 max-w-xl text-sm text-neutral-400">Add your first vehicle/unit here, or keep managing vehicles from customer files while this dedicated directory grows.</p>
          <a href="#add-vehicle" className="mt-5 inline-flex rounded-xl border border-[var(--accent-copper-soft)]/60 bg-[linear-gradient(135deg,rgba(197,122,74,0.28),rgba(197,122,74,0.16))] px-4 py-2 text-sm font-semibold text-orange-50">Add a vehicle/unit</a>
        </div>
      ) : null}

      {vehicles.length > 0 ? (
        <div className="mt-4 grid gap-3">
          {vehicles.map((vehicle) => {
            const name = vehicleCustomerDisplay(vehicle);
            const hasResolvedCustomer = Boolean(vehicle.customerName);
            const customerExternalId = normalizeVehicleText(vehicle.customerExternalId ?? vehicle.customers?.external_id);
            return (
              <article key={vehicle.id} className="rounded-2xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-200/80">{formatVehicleIdentifier(vehicle)}</div>
                    <h3 className="mt-1 truncate text-lg font-semibold text-white">{formatVehicleYearMakeModel(vehicle)}</h3>
                    <p className="mt-1 text-sm text-neutral-400">{hasResolvedCustomer ? `Linked to ${name}${customerExternalId ? ` (${customerExternalId})` : ""}` : name}</p>
                  </div>
                  {vehicle.customer_id && hasResolvedCustomer ? <Link href={`/customers/${encodeURIComponent(vehicle.customer_id)}`} className="rounded-xl border border-sky-500/30 bg-sky-950/25 px-3 py-2 text-center text-sm font-semibold text-sky-100 hover:bg-sky-900/30">Open customer file</Link> : null}
                </div>
                <dl className="mt-4 grid gap-2 md:grid-cols-4">
                  <div className="rounded-xl border border-[color:var(--desktop-border)] bg-black/20 p-3"><dt className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">External ID</dt><dd className="mt-1 truncate text-sm font-medium text-white">{normalizeVehicleText(vehicle.external_id) ?? "—"}</dd></div>
                  <div className="rounded-xl border border-[color:var(--desktop-border)] bg-black/20 p-3"><dt className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">Unit</dt><dd className="mt-1 truncate text-sm font-medium text-white">{normalizeVehicleText(vehicle.unit_number) ?? "—"}</dd></div>
                  <div className="rounded-xl border border-[color:var(--desktop-border)] bg-black/20 p-3"><dt className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">VIN</dt><dd className="mt-1 truncate text-sm font-medium text-white">{normalizeVehicleIdentifier(vehicle.vin) ?? "—"}</dd></div>
                  <div className="rounded-xl border border-[color:var(--desktop-border)] bg-black/20 p-3"><dt className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">Plate</dt><dd className="mt-1 truncate text-sm font-medium text-white">{normalizeVehicleIdentifier(vehicle.license_plate) ?? "—"}</dd></div>
                  <div className="rounded-xl border border-[color:var(--desktop-border)] bg-black/20 p-3"><dt className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">Customer</dt><dd className="mt-1 truncate text-sm font-medium text-white">{name}</dd></div>
                  <div className="rounded-xl border border-[color:var(--desktop-border)] bg-black/20 p-3"><dt className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">Customer external ID</dt><dd className="mt-1 truncate text-sm font-medium text-white">{customerExternalId ?? "—"}</dd></div>
                  <div className="rounded-xl border border-[color:var(--desktop-border)] bg-black/20 p-3"><dt className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">Mileage</dt><dd className="mt-1 truncate text-sm font-medium text-white">{normalizeVehicleText(vehicle.mileage) ?? "—"}</dd></div>
                  <div className="rounded-xl border border-[color:var(--desktop-border)] bg-black/20 p-3"><dt className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">Engine hours</dt><dd className="mt-1 truncate text-sm font-medium text-white">{vehicle.engine_hours ?? "—"}</dd></div>
                  <div className="rounded-xl border border-[color:var(--desktop-border)] bg-black/20 p-3 md:col-span-2"><dt className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">Year / make / model / submodel</dt><dd className="mt-1 truncate text-sm font-medium text-white">{formatVehicleYearMakeModel(vehicle)}</dd></div>
                  <div className="rounded-xl border border-[color:var(--desktop-border)] bg-black/20 p-3 md:col-span-2"><dt className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">Engine / fuel</dt><dd className="mt-1 truncate text-sm font-medium text-white">{[vehicle.engine, vehicle.fuel_type].map(normalizeVehicleText).filter(Boolean).join(" · ") || "—"}</dd></div>
                </dl>
                {(vehicle.import_notes || vehicle.source_row_id) ? (
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-neutral-400">
                    {vehicle.source_row_id ? <span className="rounded-full border border-white/10 bg-black/20 px-2 py-1">Source row: {vehicle.source_row_id}</span> : null}
                    {vehicle.import_notes ? <span className="max-w-full truncate rounded-full border border-white/10 bg-black/20 px-2 py-1">Import notes: {vehicle.import_notes}</span> : null}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
