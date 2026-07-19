"use client";

import { format } from "date-fns";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type Customer = DB["public"]["Tables"]["customers"]["Row"];
type Vehicle = DB["public"]["Tables"]["vehicles"]["Row"];
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];

type ParamsShape = Record<string, string | string[]>;

function paramToString(value: string | string[] | undefined): string | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

const STATUS_BADGE: Record<string, string> = {
  awaiting:
    "rounded-full border border-sky-500/60 bg-sky-500/10 px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.16em] text-sky-100",
  in_progress:
    "rounded-full border border-orange-500/60 bg-orange-500/10 px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.16em] text-orange-100",
  on_hold:
    "rounded-full border border-yellow-500/60 bg-yellow-500/10 px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.16em] text-yellow-100",
  completed:
    "rounded-full border border-emerald-500/60 bg-emerald-500/10 px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.16em] text-emerald-100",
  invoiced:
    "rounded-full border border-purple-500/60 bg-purple-500/10 px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.16em] text-purple-100",
};

function statusChipClass(status: string | null | undefined): string {
  const key = (status ?? "awaiting").toLowerCase().replace(/\s+/g, "_");
  return STATUS_BADGE[key] ?? STATUS_BADGE.awaiting;
}

export default function MobileCustomerProfilePage() {
  const params = useParams();
  const customerId = useMemo(() => {
    const raw = (params as ParamsShape)?.id;
    return paramToString(raw);
  }, [params]);
  const supabase = useMemo(() => createBrowserSupabase(), []);

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!customerId) return;
    let active = true;

    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const [customerResult, vehiclesResult, workOrdersResult] =
          await Promise.all([
            supabase
              .from("customers")
              .select("*")
              .eq("id", customerId)
              .maybeSingle(),
            supabase
              .from("vehicles")
              .select("*")
              .eq("customer_id", customerId)
              .order("created_at", { ascending: true }),
            supabase
              .from("work_orders")
              .select("*")
              .eq("customer_id", customerId)
              .order("created_at", { ascending: false }),
          ]);

        if (customerResult.error) throw customerResult.error;
        if (vehiclesResult.error) throw vehiclesResult.error;
        if (workOrdersResult.error) throw workOrdersResult.error;
        if (!active) return;

        const customerRecord = customerResult.data ?? null;
        const directVehicles = (vehiclesResult.data ?? []) as Vehicle[];
        const directVehicleIds = directVehicles
          .map((vehicle) => vehicle.id)
          .filter(Boolean);

        const vehicleWorkOrdersResult = directVehicleIds.length
          ? await supabase
              .from("work_orders")
              .select("*")
              .in("vehicle_id", directVehicleIds)
              .order("created_at", { ascending: false })
          : { data: [], error: null };
        if (vehicleWorkOrdersResult.error) throw vehicleWorkOrdersResult.error;

        const fallbackNames = [
          customerRecord?.business_name,
          customerRecord?.name,
          [customerRecord?.first_name ?? "", customerRecord?.last_name ?? ""]
            .filter(Boolean)
            .join(" ")
            .trim(),
        ].filter(
          (value): value is string =>
            typeof value === "string" && value.trim().length > 0,
        );

        let nameWorkOrders: WorkOrder[] = [];
        if (
          (workOrdersResult.data?.length ?? 0) === 0 &&
          (vehicleWorkOrdersResult.data?.length ?? 0) === 0
        ) {
          for (const candidate of fallbackNames) {
            let query = supabase
              .from("work_orders")
              .select("*")
              .ilike("customer_name", candidate);
            if (customerRecord?.shop_id) {
              query = query.eq("shop_id", customerRecord.shop_id);
            }
            const result = await query
              .order("created_at", { ascending: false })
              .limit(25);
            if (result.error) throw result.error;
            if ((result.data?.length ?? 0) > 0) {
              nameWorkOrders = result.data as WorkOrder[];
              break;
            }
          }
        }

        const workOrdersById = new Map<string, WorkOrder>();
        for (const workOrder of [
          ...((workOrdersResult.data ?? []) as WorkOrder[]),
          ...((vehicleWorkOrdersResult.data ?? []) as WorkOrder[]),
          ...nameWorkOrders,
        ]) {
          if (workOrder.id) workOrdersById.set(workOrder.id, workOrder);
        }
        const mergedWorkOrders = [...workOrdersById.values()].sort(
          (left, right) =>
            new Date(right.created_at ?? 0).getTime() -
            new Date(left.created_at ?? 0).getTime(),
        );

        const fallbackVehicleIds = Array.from(
          new Set(
            mergedWorkOrders
              .map((workOrder) => workOrder.vehicle_id)
              .filter((id): id is string => Boolean(id)),
          ),
        ).filter((id) => !directVehicleIds.includes(id));

        const fallbackVehiclesResult = fallbackVehicleIds.length
          ? await supabase
              .from("vehicles")
              .select("*")
              .in("id", fallbackVehicleIds)
          : { data: [], error: null };
        if (fallbackVehiclesResult.error) throw fallbackVehiclesResult.error;
        if (!active) return;

        setCustomer(customerRecord);
        setVehicles([
          ...directVehicles,
          ...((fallbackVehiclesResult.data ?? []) as Vehicle[]),
        ]);
        setWorkOrders(mergedWorkOrders);
      } catch (caught) {
        if (!active) return;
        setError(
          caught instanceof Error
            ? caught.message
            : "Failed to load customer profile.",
        );
        setCustomer(null);
        setVehicles([]);
        setWorkOrders([]);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [customerId, supabase]);

  if (!customerId) {
    return <div className="px-4 py-4 text-sm text-red-400">Missing customer id.</div>;
  }

  const displayName = customer
    ? customer.business_name ||
      [customer.first_name ?? "", customer.last_name ?? ""]
        .filter(Boolean)
        .join(" ") ||
      "Customer"
    : "Customer";

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-4 text-foreground">
      <div className="flex items-center justify-between gap-2">
        <Link
          href="/mobile/work-orders"
          className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3 py-1 text-xs text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-panel)]"
        >
          ← Work orders
        </Link>
        <Link
          href={`/mobile/work-orders/create?customerId=${encodeURIComponent(customerId)}`}
          className="rounded-full border border-[var(--accent-copper-soft)]/70 bg-[color:var(--theme-surface-subtle)] px-3 py-1 text-[0.7rem] font-semibold text-[color:var(--theme-text-primary)]"
        >
          + Work order
        </Link>
      </div>

      <div className="space-y-1">
        <h1 className="text-lg font-blackops uppercase tracking-[0.18em] text-[color:var(--theme-text-primary)]">
          Customer
        </h1>
        <p className="text-xs text-[color:var(--theme-text-secondary)]">
          {displayName}
        </p>
      </div>

      {error ? (
        <div className="rounded-md border border-red-500/60 bg-red-950/40 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-4 text-sm text-[color:var(--theme-text-secondary)]">
          Loading customer…
        </div>
      ) : !customer ? (
        <div className="rounded-lg border border-dashed border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-6 text-sm text-[color:var(--theme-text-secondary)]">
          Customer not found.
        </div>
      ) : (
        <>
          <section className="space-y-2 rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3 py-3 text-sm">
            <div className="mb-1 text-[0.7rem] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
              Contact
            </div>
            <div className="space-y-1 text-xs text-[color:var(--theme-text-primary)]">
              <div>
                <span className="text-[color:var(--theme-text-muted)]">Name:</span>{" "}
                {displayName}
              </div>
              <div>
                <span className="text-[color:var(--theme-text-muted)]">Email:</span>{" "}
                {customer.email ?? "—"}
              </div>
              <div>
                <span className="text-[color:var(--theme-text-muted)]">Phone:</span>{" "}
                {customer.phone ?? "—"}
              </div>
            </div>

            <div className="mb-1 mt-3 text-[0.7rem] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
              Address
            </div>
            <div className="space-y-1 text-xs text-[color:var(--theme-text-primary)]">
              <div>{customer.address || "—"}</div>
              <div>
                {[
                  customer.city || "",
                  customer.province || "",
                  customer.postal_code || "",
                ]
                  .filter(Boolean)
                  .join(", ") || "—"}
              </div>
            </div>
          </section>

          <section className="space-y-2 rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3 py-3 text-sm">
            <div className="mb-1 flex items-center justify-between">
              <div className="text-[0.7rem] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
                Vehicles
              </div>
              {vehicles.length > 0 ? (
                <div className="text-[0.7rem] text-[color:var(--theme-text-muted)]">
                  {vehicles.length} total
                </div>
              ) : null}
            </div>

            {vehicles.length === 0 ? (
              <p className="text-xs text-[color:var(--theme-text-secondary)]">
                No vehicles yet.
              </p>
            ) : (
              <div className="space-y-2">
                {vehicles.map((vehicle) => {
                  const title = [
                    vehicle.year ? String(vehicle.year) : "",
                    vehicle.make ?? "",
                    vehicle.model ?? "",
                  ]
                    .filter(Boolean)
                    .join(" ");

                  return (
                    <div
                      key={vehicle.id}
                      className="rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3 py-2 text-xs text-[color:var(--theme-text-primary)]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium text-[color:var(--theme-text-primary)]">
                          {title || "Vehicle"}
                        </div>
                        {vehicle.license_plate ? (
                          <span className="rounded-full border border-[color:var(--theme-border-soft)] px-2 py-0.5 text-[0.65rem] text-[color:var(--theme-text-primary)]">
                            {vehicle.license_plate}
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-2 grid grid-cols-2 gap-1 text-[0.7rem] text-[color:var(--theme-text-secondary)]">
                        <div>
                          <span className="text-[color:var(--theme-text-muted)]">VIN:</span>{" "}
                          {vehicle.vin || "—"}
                        </div>
                        <div>
                          <span className="text-[color:var(--theme-text-muted)]">Mileage:</span>{" "}
                          {vehicle.mileage || "—"}
                        </div>
                        <div>
                          <span className="text-[color:var(--theme-text-muted)]">Unit #:</span>{" "}
                          {vehicle.unit_number || "—"}
                        </div>
                        <div>
                          <span className="text-[color:var(--theme-text-muted)]">Color:</span>{" "}
                          {vehicle.color || "—"}
                        </div>
                        <div>
                          <span className="text-[color:var(--theme-text-muted)]">Engine hrs:</span>{" "}
                          {vehicle.engine_hours != null
                            ? String(vehicle.engine_hours)
                            : "—"}
                        </div>
                        <div>
                          <span className="text-[color:var(--theme-text-muted)]">Engine:</span>{" "}
                          {vehicle.engine || "—"}
                        </div>
                        <div>
                          <span className="text-[color:var(--theme-text-muted)]">Trans:</span>{" "}
                          {vehicle.transmission || "—"}
                        </div>
                        <div>
                          <span className="text-[color:var(--theme-text-muted)]">Fuel:</span>{" "}
                          {vehicle.fuel_type || "—"}
                        </div>
                        <div className="col-span-2">
                          <span className="text-[color:var(--theme-text-muted)]">Drivetrain:</span>{" "}
                          {vehicle.drivetrain || "—"}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="space-y-2 rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3 py-3 text-sm">
            <div className="mb-1 flex items-center justify-between">
              <div className="text-[0.7rem] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
                Work Orders
              </div>
              {workOrders.length > 0 ? (
                <div className="text-[0.7rem] text-[color:var(--theme-text-muted)]">
                  {workOrders.length} total
                </div>
              ) : null}
            </div>

            {workOrders.length === 0 ? (
              <p className="text-xs text-[color:var(--theme-text-secondary)]">
                No work orders yet for this customer.
              </p>
            ) : (
              <div className="space-y-2">
                {workOrders.map((workOrder) => (
                  <Link
                    key={workOrder.id}
                    href={`/mobile/work-orders/${workOrder.id}`}
                    className="block w-full rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3 py-2 text-left text-xs text-[color:var(--theme-text-primary)] hover:border-orange-500/80"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-medium text-[color:var(--theme-text-primary)]">
                          {workOrder.custom_id
                            ? `WO ${workOrder.custom_id}`
                            : `WO #${workOrder.id.slice(0, 8)}`}
                        </div>
                        <div className="text-[0.7rem] text-[color:var(--theme-text-secondary)]">
                          {workOrder.created_at
                            ? format(new Date(workOrder.created_at), "PP p")
                            : "—"}
                        </div>
                      </div>
                      <span className={statusChipClass(workOrder.status ?? null)}>
                        {(workOrder.status ?? "awaiting").replaceAll("_", " ")}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
