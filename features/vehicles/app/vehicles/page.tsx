"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import GuidedPageStepPanel from "@/features/onboarding-v2/components/GuidedPageStepPanel";
import { VehicleCsvImportCard } from "@/features/vehicles/components/VehicleCsvImportCard";
import { usePersistentGuidedOnboardingQuery } from "@/features/onboarding-v2/guided/persistence";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type Vehicle = DB["public"]["Tables"]["vehicles"]["Row"];
type Customer = DB["public"]["Tables"]["customers"]["Row"];

type CustomerSummary = Pick<
  Customer,
  | "id"
  | "business_name"
  | "name"
  | "first_name"
  | "last_name"
  | "email"
  | "phone"
  | "phone_number"
>;

type VehicleSearchRow = Pick<
  Vehicle,
  | "id"
  | "shop_id"
  | "customer_id"
  | "unit_number"
  | "vin"
  | "license_plate"
  | "year"
  | "make"
  | "model"
  | "created_at"
> & {
  customers?: CustomerSummary | null;
};

const CARD_BASE =
  "rounded-2xl border border-[color:var(--metal-border-soft,var(--theme-border-soft))] bg-[color:var(--desktop-panel-bg-soft)] shadow-[var(--theme-shadow-medium)] backdrop-blur-xl";
const CARD_INNER =
  "rounded-xl border border-[color:var(--metal-border-soft,var(--theme-border-soft))] bg-[color:var(--desktop-item-bg)]";

function customerDisplayName(
  c: CustomerSummary | null | undefined,
): string | null {
  if (!c) return null;
  const businessName = c.business_name?.trim();
  if (businessName) return businessName;
  const name = c.name?.trim();
  if (name) return name;
  const person = [c.first_name ?? "", c.last_name ?? ""]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (person) return person;
  return c.email ?? c.phone ?? c.phone_number ?? null;
}

function vehicleYearMakeModel(
  v: Pick<Vehicle, "year" | "make" | "model">,
): string {
  return [v.year != null ? String(v.year) : "", v.make ?? "", v.model ?? ""]
    .filter(Boolean)
    .join(" ");
}

function vehicleDisplayLabel(v: VehicleSearchRow): string {
  const unitNumber = v.unit_number?.trim();
  if (unitNumber) return unitNumber;
  const ymm = vehicleYearMakeModel(v).trim();
  if (ymm) return ymm;
  const plate = v.license_plate?.trim();
  if (plate) return plate;
  return v.vin?.trim() || "Vehicle";
}

function vehicleSearchHaystack(v: VehicleSearchRow): string {
  return [
    v.unit_number,
    v.vin,
    v.license_plate,
    v.year != null ? String(v.year) : null,
    v.make,
    v.model,
    customerDisplayName(v.customers),
  ]
    .filter(
      (value): value is string =>
        typeof value === "string" && value.trim().length > 0,
    )
    .join(" ")
    .toLowerCase();
}

function sortVehicleRows(rows: VehicleSearchRow[]): VehicleSearchRow[] {
  return [...rows].sort((a, b) =>
    vehicleDisplayLabel(a).localeCompare(vehicleDisplayLabel(b), undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );
}

export default function VehicleFilesPage() {
  const router = useRouter();
  const vehicleGuidedQuery = usePersistentGuidedOnboardingQuery("vehicles");
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [allRows, setAllRows] = useState<VehicleSearchRow[]>([]);
  const [visibleRows, setVisibleRows] = useState<VehicleSearchRow[]>([]);

  const getOrLinkShopId = useCallback(
    async (userId: string): Promise<string | null> => {
      const byUserId = await supabase
        .from("profiles")
        .select("shop_id")
        .eq("user_id", userId)
        .maybeSingle();

      if (byUserId.error) throw byUserId.error;
      if (byUserId.data?.shop_id) return byUserId.data.shop_id;

      const byId = await supabase
        .from("profiles")
        .select("shop_id")
        .eq("id", userId)
        .maybeSingle();

      if (byId.error) throw byId.error;
      if (byId.data?.shop_id) return byId.data.shop_id;

      const ownedShop = await supabase
        .from("shops")
        .select("id")
        .eq("owner_id", userId)
        .maybeSingle();

      if (ownedShop.error) throw ownedShop.error;
      return ownedShop.data?.id ?? null;
    },
    [supabase],
  );

  const loadVehicles = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.id) {
        setAllRows([]);
        setVisibleRows([]);
        return;
      }

      const shopId = await getOrLinkShopId(user.id);
      if (!shopId) {
        setAllRows([]);
        setVisibleRows([]);
        return;
      }

      const { data, error } = await supabase
        .from("vehicles")
        .select(
          "id, shop_id, customer_id, unit_number, vin, license_plate, year, make, model, created_at, customers(id, business_name, name, first_name, last_name, email, phone, phone_number)",
        )
        .eq("shop_id", shopId);

      if (error) {
        setAllRows([]);
        setVisibleRows([]);
        return;
      }

      const rows = (
        (data ?? []) as Array<
          VehicleSearchRow & {
            customers?: CustomerSummary | CustomerSummary[] | null;
          }
        >
      ).map((row) => ({
        ...row,
        customers: Array.isArray(row.customers)
          ? (row.customers[0] ?? null)
          : (row.customers ?? null),
      }));
      const sortedRows = sortVehicleRows(rows);
      setAllRows(sortedRows);
      setVisibleRows(sortedRows.slice(0, 20));
    } catch {
      setAllRows([]);
      setVisibleRows([]);
    } finally {
      setLoading(false);
    }
  }, [getOrLinkShopId, supabase]);

  useEffect(() => {
    void loadVehicles();
  }, [loadVehicles]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const q = query.trim().toLowerCase();
      const rows = q
        ? allRows.filter((row) => vehicleSearchHaystack(row).includes(q))
        : allRows;
      setVisibleRows(sortVehicleRows(rows).slice(0, 20));
    }, 150);

    return () => window.clearTimeout(timer);
  }, [allRows, query]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 py-5 text-[color:var(--theme-text-primary)]">
      <GuidedPageStepPanel />

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-full border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--theme-text-primary)] hover:border-[var(--accent-copper-soft)]/70 hover:text-[color:var(--theme-text-primary)]"
        >
          ← Back
        </button>
        <div className="text-xs text-[color:var(--theme-text-muted)]">Vehicles</div>
      </div>

      <VehicleCsvImportCard guidedQuery={vehicleGuidedQuery} />

      <div className={`${CARD_BASE} p-4`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1
              className="text-2xl font-semibold text-[color:var(--theme-text-primary)]"
              style={{ fontFamily: "var(--font-blackops), system-ui" }}
            >
              Vehicle Files
            </h1>
            <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
              Search by unit, VIN, plate, year, make, model, or customer.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:w-[680px] sm:flex-row">
            <button
              type="button"
              onClick={() => router.push("/customers/directory")}
              className="rounded-xl border border-[var(--accent-copper-soft)]/55 bg-[color:var(--desktop-item-bg)] px-4 py-2 text-sm font-semibold text-[color:var(--theme-text-primary)] hover:border-[var(--accent-copper)] hover:bg-[color:var(--theme-surface-inset)]"
              title="Select a customer file to add a vehicle."
            >
              + Create Vehicle
            </button>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search vehicles..."
              className="w-full rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-soft)]"
            />
          </div>
        </div>

        <div className="mt-4">
          {visibleRows.length === 0 ? (
            <div className={`${CARD_INNER} p-3 text-sm text-[color:var(--theme-text-secondary)]`}>
              {loading
                ? "Loading vehicles…"
                : allRows.length === 0
                  ? "No vehicles found yet."
                  : "No vehicles match your search."}
            </div>
          ) : (
            <div className="space-y-2">
              {visibleRows.map((vehicle) => {
                const customerName = customerDisplayName(vehicle.customers);
                const yearMakeModel =
                  vehicleYearMakeModel(vehicle) || "Vehicle";

                return (
                  <button
                    key={vehicle.id}
                    type="button"
                    onClick={() => {
                      if (vehicle.customer_id)
                        router.push(`/customers/${vehicle.customer_id}`);
                    }}
                    className={`${CARD_INNER} w-full p-3 text-left hover:border-[var(--accent-copper-soft)]/65`}
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-[color:var(--theme-text-primary)]">
                          {yearMakeModel}
                        </div>
                        <div className="mt-0.5 truncate text-[11px] text-[color:var(--theme-text-secondary)]">
                          {vehicle.unit_number?.trim()
                            ? `Unit ${vehicle.unit_number}`
                            : "No unit number"}
                        </div>
                        <div className="mt-0.5 text-[11px] text-[color:var(--theme-text-secondary)]">
                          VIN: {vehicle.vin?.trim() || "—"} · Plate:{" "}
                          {vehicle.license_plate?.trim() || "—"}
                        </div>
                      </div>
                      <div className="text-left text-[11px] text-[color:var(--theme-text-secondary)] sm:text-right">
                        <div className="text-[color:var(--theme-text-secondary)]">
                          {customerName ?? "No linked customer"}
                        </div>
                        <div className="mt-0.5 text-[color:var(--theme-text-muted)]">
                          {vehicleDisplayLabel(vehicle)}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
