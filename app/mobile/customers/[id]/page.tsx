// app/mobile/customers/[id]/page.tsx (FULL FILE REPLACEMENT)
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";
import { format } from "date-fns";

type DB = Database;
type Customer = DB["public"]["Tables"]["customers"]["Row"];
type Vehicle = DB["public"]["Tables"]["vehicles"]["Row"];
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];

type ParamsShape = Record<string, string | string[]>;

function paramToString(v: string | string[] | undefined): string | null {
  if (!v) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

const STATUS_BADGE: Record<string, string> = {
  awaiting:
    "bg-sky-500/10 border border-sky-500/60 text-[0.65rem] uppercase tracking-[0.16em] text-sky-100 rounded-full px-2 py-0.5",
  in_progress:
    "bg-orange-500/10 border border-orange-500/60 text-[0.65rem] uppercase tracking-[0.16em] text-orange-100 rounded-full px-2 py-0.5",
  on_hold:
    "bg-yellow-500/10 border border-yellow-500/60 text-[0.65rem] uppercase tracking-[0.16em] text-yellow-100 rounded-full px-2 py-0.5",
  completed:
    "bg-emerald-500/10 border border-emerald-500/60 text-[0.65rem] uppercase tracking-[0.16em] text-emerald-100 rounded-full px-2 py-0.5",
  invoiced:
    "bg-purple-500/10 border border-purple-500/60 text-[0.65rem] uppercase tracking-[0.16em] text-purple-100 rounded-full px-2 py-0.5",
};

function statusChipClass(status: string | null | undefined): string {
  const key = (status ?? "awaiting").toLowerCase().replace(/\s+/g, "_");
  return STATUS_BADGE[key] ?? STATUS_BADGE.awaiting;
}

export default function MobileCustomerProfilePage() {
  const params = useParams();
  const router = useRouter();
  const customerId = useMemo(() => {
    const raw = (params as ParamsShape)?.id;
    return paramToString(raw);
  }, [params]);

  const supabase = useMemo(() => createBrowserSupabase(), []);

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!customerId) return;

    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const [cRes, vRes, woRes] = await Promise.all([
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

        if (cRes.error) throw cRes.error;
        setCustomer(cRes.data ?? null);

        if (vRes.error) throw vRes.error;
        const directVehicles = vRes.data ?? [];
        const directVehicleIds = directVehicles.map((v) => v.id).filter(Boolean);

        if (woRes.error) throw woRes.error;
        const fallbackWosRes = directVehicleIds.length
          ? await supabase
              .from("work_orders")
              .select("*")
              .in("vehicle_id", directVehicleIds)
              .order("created_at", { ascending: false })
          : { data: [], error: null };

        if (fallbackWosRes.error) throw fallbackWosRes.error;

        const customerRecord = cRes.data;
        const fallbackWosByNameCandidates = [
          customerRecord?.business_name,
          customerRecord?.name,
          [customerRecord?.first_name ?? "", customerRecord?.last_name ?? ""]
            .filter(Boolean)
            .join(" ")
            .trim(),
        ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);

        let fallbackWosByName: WorkOrder[] = [];
        if ((woRes.data?.length ?? 0) === 0 && (fallbackWosRes.data?.length ?? 0) === 0) {
          for (const candidate of fallbackWosByNameCandidates) {
            let byNameQuery = supabase
              .from("work_orders")
              .select("*")
              .ilike("customer_name", candidate);
            if (customerRecord?.shop_id) byNameQuery = byNameQuery.eq("shop_id", customerRecord.shop_id);
            const byNameRes = await byNameQuery
              .order("created_at", { ascending: false })
              .limit(25);
            if (byNameRes.error) throw byNameRes.error;
            if ((byNameRes.data?.length ?? 0) > 0) {
              fallbackWosByName = byNameRes.data as WorkOrder[];
              break;
            }
          }
        }

        const allWorkOrders = [...(woRes.data ?? []), ...(fallbackWosRes.data ?? []), ...fallbackWosByName];
        const workOrdersById = new Map<string, WorkOrder>();
        for (const wo of allWorkOrders) {
          if (!wo?.id) continue;
          workOrdersById.set(wo.id, wo);
        }
        const mergedWorkOrders = Array.from(workOrdersById.values()).sort(
          (a, b) => new Date(String(b.created_at ?? "")).getTime() - new Date(String(a.created_at ?? "")).getTime(),
        );

        const fallbackVehicleIds = Array.from(
          new Set(
            mergedWorkOrders
              .map((wo) => wo.vehicle_id)
              .filter((id): id is string => typeof id === "string" && id.length > 0),
          ),
        ).filter((id) => !directVehicleIds.includes(id));

        const fallbackVehiclesRes = fallbackVehicleIds.length
          ? await supabase.from("vehicles").select("*").in("id", fallbackVehicleIds)
          : { data: [], error: null };

        if (fallbackVehiclesRes.error) throw fallbackVehiclesRes.error;

        setVehicles([...(directVehicles as Vehicle[]), ...((fallbackVehiclesRes.data ?? []) as Vehicle[])]);
        setWorkOrders(mergedWorkOrders);
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : "Failed to load customer profile.";
        setErr(msg);
        setCustomer(null);
        setVehicles([]);
        setWorkOrders([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [customerId, supabase]);

  if (!customerId) {
    return (
        <div className="px-4 py-4 text-sm text-red-400">
          Missing customer id.
        </div>
    );
  }

  const displayName = customer
    ? customer.business_name ||
      [customer.first_name ?? "", customer.last_name ?? ""]
        .filter(Boolean)
        .join(" ") ||
      "Customer"
    : "Customer";

  return (
      <div className="mx-auto w-full max-w-5xl px-4 py-4 space-y-4 text-foreground">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3 py-1 text-xs text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-panel)]"
          >
            ← Back
          </button>

          <Link
            href={`/customers/${customerId}`}
            className="rounded-full border border-orange-500/70 bg-orange-500 px-3 py-1 text-[0.7rem] font-semibold text-[color:var(--theme-text-on-accent)] hover:bg-orange-400"
          >
            Open full view
          </Link>
        </div>

        {/* Heading */}
        <div className="space-y-1">
          <h1 className="text-lg font-blackops uppercase tracking-[0.18em] text-[color:var(--theme-text-primary)]">
            Customer
          </h1>
          <p className="text-xs text-[color:var(--theme-text-secondary)]">{displayName}</p>
        </div>

        {err && (
          <div className="rounded-md border border-red-500/60 bg-red-950/40 px-3 py-2 text-xs text-red-200">
            {err}
          </div>
        )}

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
            {/* Customer details */}
            <section className="space-y-2 rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3 py-3 text-sm">
              <div className="mb-1 text-[0.7rem] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
                Contact
              </div>
              <div className="space-y-1 text-xs text-[color:var(--theme-text-primary)]">
                <div>
                  <span className="text-[color:var(--theme-text-muted)]">Name:</span> {displayName}
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

              <div className="mt-3 mb-1 text-[0.7rem] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
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

            {/* Vehicles */}
            <section className="space-y-2 rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3 py-3 text-sm">
              <div className="mb-1 flex items-center justify-between">
                <div className="text-[0.7rem] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
                  Vehicles
                </div>
                {vehicles.length > 0 && (
                  <div className="text-[0.7rem] text-[color:var(--theme-text-muted)]">
                    {vehicles.length} total
                  </div>
                )}
              </div>

              {vehicles.length === 0 ? (
                <p className="text-xs text-[color:var(--theme-text-secondary)]">No vehicles yet.</p>
              ) : (
                <div className="space-y-2">
                  {vehicles.map((v) => {
                    const title = [
                      v.year ? String(v.year) : "",
                      v.make ?? "",
                      v.model ?? "",
                    ]
                      .filter(Boolean)
                      .join(" ");

                    return (
                      <div
                        key={v.id}
                        className="rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3 py-2 text-xs text-[color:var(--theme-text-primary)]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium text-[color:var(--theme-text-primary)]">
                            {title || "Vehicle"}
                          </div>
                          {v.license_plate && (
                            <span className="rounded-full border border-[color:var(--theme-border-soft)] px-2 py-0.5 text-[0.65rem] text-[color:var(--theme-text-primary)]">
                              {v.license_plate}
                            </span>
                          )}
                        </div>

                        <div className="mt-2 grid grid-cols-2 gap-1 text-[0.7rem] text-[color:var(--theme-text-secondary)]">
                          <div>
                            <span className="text-[color:var(--theme-text-muted)]">VIN:</span>{" "}
                            {v.vin || "—"}
                          </div>
                          <div>
                            <span className="text-[color:var(--theme-text-muted)]">Mileage:</span>{" "}
                            {v.mileage || "—"}
                          </div>
                          <div>
                            <span className="text-[color:var(--theme-text-muted)]">Unit #:</span>{" "}
                            {v.unit_number || "—"}
                          </div>
                          <div>
                            <span className="text-[color:var(--theme-text-muted)]">Color:</span>{" "}
                            {v.color || "—"}
                          </div>
                          <div>
                            <span className="text-[color:var(--theme-text-muted)]">Engine hrs:</span>{" "}
                            {v.engine_hours != null
                              ? String(v.engine_hours)
                              : "—"}
                          </div>
                          <div>
                            <span className="text-[color:var(--theme-text-muted)]">Engine:</span>{" "}
                            {v.engine || "—"}
                          </div>
                          <div>
                            <span className="text-[color:var(--theme-text-muted)]">Trans:</span>{" "}
                            {v.transmission || "—"}
                          </div>
                          <div>
                            <span className="text-[color:var(--theme-text-muted)]">Fuel:</span>{" "}
                            {v.fuel_type || "—"}
                          </div>
                          <div className="col-span-2">
                            <span className="text-[color:var(--theme-text-muted)]">Drivetrain:</span>{" "}
                            {v.drivetrain || "—"}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Work order history */}
            <section className="space-y-2 rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3 py-3 text-sm">
              <div className="mb-1 flex items-center justify-between">
                <div className="text-[0.7rem] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
                  Work Orders
                </div>
                {workOrders.length > 0 && (
                  <div className="text-[0.7rem] text-[color:var(--theme-text-muted)]">
                    {workOrders.length} total
                  </div>
                )}
              </div>

              {workOrders.length === 0 ? (
                <p className="text-xs text-[color:var(--theme-text-secondary)]">
                  No work orders yet for this customer.
                </p>
              ) : (
                <div className="space-y-2">
                  {workOrders.map((wo) => (
                    <button
                      key={wo.id}
                      type="button"
                      onClick={() => router.push(`/mobile/work-orders/${wo.id}`)}
                      className="w-full rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3 py-2 text-left text-xs text-[color:var(--theme-text-primary)] hover:border-orange-500/80"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium text-[color:var(--theme-text-primary)] truncate">
                            {wo.custom_id
                              ? `WO ${wo.custom_id}`
                              : `WO #${wo.id.slice(0, 8)}`}
                          </div>
                          <div className="text-[0.7rem] text-[color:var(--theme-text-secondary)]">
                            {wo.created_at
                              ? format(new Date(wo.created_at), "PP p")
                              : "—"}
                          </div>
                        </div>
                        <span className={statusChipClass(wo.status ?? null)}>
                          {(wo.status ?? "awaiting").replaceAll("_", " ")}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
  );
}
