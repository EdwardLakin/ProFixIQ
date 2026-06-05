import { redirect } from "next/navigation";
import type { Database } from "@shared/types/types/supabase";
import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";
import { resolveCurrentActor } from "@/features/shared/lib/currentActor";
import { parseGuidedOnboardingQuery } from "@/features/onboarding-v2/guided/query";
import { VehicleCsvImportCard } from "@/features/vehicles/components/VehicleCsvImportCard";
import { VehicleCreateForm } from "@/features/vehicles/components/VehicleCreateForm";
import { shouldShowVehicleOnboardingCard } from "@/features/vehicles/lib/guided";
import { fetchVehicleDirectoryRows } from "@/features/vehicles/lib/list";
import { fetchVehicleImportCustomers } from "@/features/vehicles/lib/importCustomers";
import { VehicleDirectory } from "@/features/vehicles/components/VehicleDirectory";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type DB = Database;
type Customer = DB["public"]["Tables"]["customers"]["Row"];

type CustomerOption = Pick<Customer, "id" | "business_name" | "name" | "first_name" | "last_name" | "email" | "phone" | "phone_number" | "external_id">;

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

  const [{ rows: vehicles, error: vehicleError }, importCustomers] = await Promise.all([
    fetchVehicleDirectoryRows(supabase, actor.shopId),
    fetchVehicleImportCustomers(supabase, actor.shopId),
  ]);

  const customers = importCustomers as CustomerOption[];

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

      <VehicleDirectory vehicles={vehicles} vehicleError={vehicleError ? "Unable to load vehicles right now." : null} initialQuery={query} />
    </main>
  );
}
