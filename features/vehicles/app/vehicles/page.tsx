import Link from "next/link";
import { redirect } from "next/navigation";
import type { Database } from "@shared/types/types/supabase";
import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";
import { resolveCurrentActor } from "@/features/shared/lib/currentActor";
import { parseGuidedOnboardingQuery } from "@/features/onboarding-v2/guided/query";
import { VehicleCsvImportCard } from "@/features/vehicles/components/VehicleCsvImportCard";
import { VehicleCreateForm } from "@/features/vehicles/components/VehicleCreateForm";
import { shouldShowVehicleOnboardingCard } from "@/features/vehicles/lib/guided";
import { formatVehicleIdentifier, formatVehicleYearMakeModel, normalizeVehicleIdentifier, normalizeVehicleText } from "@/features/vehicles/lib/display";
import { filterSortAndCapVehicles, vehicleCustomerName, type VehicleListRow } from "@/features/vehicles/lib/list";

type DB = Database;
type Customer = DB["public"]["Tables"]["customers"]["Row"];

type CustomerOption = Pick<Customer, "id" | "business_name" | "name" | "first_name" | "last_name" | "email" | "phone" | "phone_number">;

type SearchParams = Record<string, string | string[] | undefined>;

function paramToString(value: string | string[] | undefined): string | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

export default async function VehiclesPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const params = (await searchParams) ?? {};
  const query = paramToString(params.q)?.trim() ?? "";
  const guidedQuery = parseGuidedOnboardingQuery(new URLSearchParams(Object.entries(params).flatMap(([key, value]) => {
    if (Array.isArray(value)) return value.map((item) => [key, item] as [string, string]);
    return value == null ? [] : [[key, value] as [string, string]];
  })));
  const vehiclesHighlightActive = shouldShowVehicleOnboardingCard(guidedQuery);

  const supabase = createServerSupabaseRSC();
  const actor = await resolveCurrentActor(supabase);

  if (!actor.user?.id) redirect(`/sign-in?redirect=${encodeURIComponent("/vehicles")}`);
  if (!actor.shopId) redirect("/account/shop-assignment-required");

  const [{ data: vehicleRows, error: vehicleError }, { data: customerRows }] = await Promise.all([
    supabase
      .from("vehicles")
      .select("id, external_id, unit_number, year, make, model, submodel, vin, license_plate, customer_id, mileage, engine_hours, engine, fuel_type, import_notes, source_row_id, customers(id, business_name, name, first_name, last_name, email, phone, phone_number)")
      .eq("shop_id", actor.shopId),
    supabase
      .from("customers")
      .select("id, business_name, name, first_name, last_name, email, phone, phone_number")
      .eq("shop_id", actor.shopId)
      .order("updated_at", { ascending: false })
      .limit(200),
  ]);

  const vehicles = filterSortAndCapVehicles(((vehicleRows ?? []) as unknown as VehicleListRow[]).map((row) => ({ ...row, customers: Array.isArray(row.customers) ? row.customers[0] ?? null : row.customers })), query);
  const customers = (customerRows ?? []) as CustomerOption[];

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <header className="rounded-[28px] border border-[color:var(--desktop-border)] bg-[radial-gradient(circle_at_top_left,rgba(197,122,74,0.18),rgba(15,23,42,0.90)_36%,rgba(2,6,23,0.96))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-200/80">Operations directory</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">Vehicles</h1>
            <p className="mt-2 max-w-2xl text-sm text-neutral-300">Units, VINs, plates, and customer-linked assets.</p>
          </div>
          <a href="#add-vehicle" className="inline-flex items-center justify-center rounded-xl border border-[var(--accent-copper-soft)]/60 bg-[linear-gradient(135deg,rgba(197,122,74,0.28),rgba(197,122,74,0.16))] px-4 py-2 text-sm font-semibold text-orange-50 hover:border-[var(--accent-copper)]">Add vehicle</a>
        </div>
      </header>

      <VehicleCsvImportCard customers={customers} guidedQuery={guidedQuery} highlighted={vehiclesHighlightActive} />

      <VehicleCreateForm customers={customers} />

      <section className="rounded-2xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-panel-bg-soft)] p-4 shadow-[0_18px_45px_rgba(0,0,0,0.45)]">
        <form className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Vehicle directory</h2>
            <p className="mt-1 text-sm text-neutral-400">Showing current-shop vehicles only.</p>
          </div>
          <input name="q" defaultValue={query} placeholder="Search VIN, plate, unit, YMM, customer, external ID…" className="w-full rounded-xl border border-[color:var(--desktop-border)] bg-black/25 px-3 py-2 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-[var(--accent-copper-soft)] sm:max-w-md" />
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
              const name = vehicleCustomerName(vehicle.customers);
              return (
                <article key={vehicle.id} className="rounded-2xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-200/80">{formatVehicleIdentifier(vehicle)}</div>
                      <h3 className="mt-1 truncate text-lg font-semibold text-white">{formatVehicleYearMakeModel(vehicle)}</h3>
                      <p className="mt-1 text-sm text-neutral-400">{name ? `Linked to ${name}` : "No customer linked"}</p>
                    </div>
                    {vehicle.customer_id && name ? <Link href={`/customers/${encodeURIComponent(vehicle.customer_id)}`} className="rounded-xl border border-sky-500/30 bg-sky-950/25 px-3 py-2 text-center text-sm font-semibold text-sky-100 hover:bg-sky-900/30">Open customer file</Link> : null}
                  </div>
                  <dl className="mt-4 grid gap-2 md:grid-cols-4">
                    <div className="rounded-xl border border-[color:var(--desktop-border)] bg-black/20 p-3"><dt className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">External ID</dt><dd className="mt-1 truncate text-sm font-medium text-white">{normalizeVehicleText(vehicle.external_id) ?? "—"}</dd></div>
                    <div className="rounded-xl border border-[color:var(--desktop-border)] bg-black/20 p-3"><dt className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">Unit</dt><dd className="mt-1 truncate text-sm font-medium text-white">{normalizeVehicleText(vehicle.unit_number) ?? "—"}</dd></div>
                    <div className="rounded-xl border border-[color:var(--desktop-border)] bg-black/20 p-3"><dt className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">VIN</dt><dd className="mt-1 truncate text-sm font-medium text-white">{normalizeVehicleIdentifier(vehicle.vin) ?? "—"}</dd></div>
                    <div className="rounded-xl border border-[color:var(--desktop-border)] bg-black/20 p-3"><dt className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">Plate</dt><dd className="mt-1 truncate text-sm font-medium text-white">{normalizeVehicleIdentifier(vehicle.license_plate) ?? "—"}</dd></div>
                    <div className="rounded-xl border border-[color:var(--desktop-border)] bg-black/20 p-3"><dt className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">Mileage</dt><dd className="mt-1 truncate text-sm font-medium text-white">{normalizeVehicleText(vehicle.mileage) ?? "—"}</dd></div>
                    <div className="rounded-xl border border-[color:var(--desktop-border)] bg-black/20 p-3"><dt className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">Engine hours</dt><dd className="mt-1 truncate text-sm font-medium text-white">{vehicle.engine_hours ?? "—"}</dd></div>
                    <div className="rounded-xl border border-[color:var(--desktop-border)] bg-black/20 p-3"><dt className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">Engine / fuel</dt><dd className="mt-1 truncate text-sm font-medium text-white">{[vehicle.engine, vehicle.fuel_type].map(normalizeVehicleText).filter(Boolean).join(" · ") || "—"}</dd></div>
                    <div className="rounded-xl border border-[color:var(--desktop-border)] bg-black/20 p-3"><dt className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">Customer</dt><dd className="mt-1 truncate text-sm font-medium text-white">{name ?? "No customer linked"}</dd></div>
                  </dl>
                  {(vehicle.import_notes || vehicle.source_row_id || vehicle.submodel) ? (
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-neutral-400">
                      {vehicle.submodel ? <span className="rounded-full border border-white/10 bg-black/20 px-2 py-1">Trim: {vehicle.submodel}</span> : null}
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
    </main>
  );
}
