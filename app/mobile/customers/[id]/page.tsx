"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { format } from "date-fns";
import { MobileShell } from "components/layout/MobileShell";

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

  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

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
        setVehicles(vRes.data ?? []);

        if (woRes.error) throw woRes.error;
        setWorkOrders(woRes.data ?? []);
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
      <MobileShell>
        <div className="px-4 py-4 text-sm text-red-400">
          Missing customer id.
        </div>
      </MobileShell>
    );
  }

  return (
    <MobileShell>
      <div className="px-4 py-4 space-y-4 text-foreground">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-full border border-neutral-700 bg-neutral-950 px-3 py-1 text-xs text-neutral-200 hover:bg-neutral-900"
          >
            ← Back
          </button>

          <Link
            href={`/customers/${customerId}`}
            className="rounded-full border border-orange-500/70 bg-orange-500 px-3 py-1 text-[0.7rem] font-semibold text-black hover:bg-orange-400"
          >
            Open full view
          </Link>
        </div>

        {/* Heading */}
        <div className="space-y-1">
          <h1 className="text-lg font-blackops uppercase tracking-[0.18em] text-neutral-200">
            Customer
          </h1>
          {customer && (
            <p className="text-xs text-neutral-400">
              {[customer.first_name ?? "", customer.last_name ?? ""]
                .filter(Boolean)
                .join(" ") || "Customer"}
            </p>
          )}
        </div>

        {err && (
          <div className="rounded-md border border-red-500/60 bg-red-950/40 px-3 py-2 text-xs text-red-200">
            {err}
          </div>
        )}

        {loading ? (
          <div className="rounded-lg border border-white/10 bg-black/40 px-3 py-4 text-sm text-neutral-300">
            Loading customer…
          </div>
        ) : !customer ? (
          <div className="rounded-lg border border-dashed border-white/15 bg-black/40 px-3 py-6 text-sm text-neutral-400">
            Customer not found.
          </div>
        ) : (
          <>
            {/* Customer details */}
            <section className="space-y-2 rounded-lg border border-neutral-800 bg-neutral-950/80 px-3 py-3 text-sm">
              <div className="mb-1 text-[0.7rem] uppercase tracking-[0.16em] text-neutral-500">
                Contact
              </div>
              <div className="space-y-1 text-xs text-neutral-200">
                <div>
                  <span className="text-neutral-500">Name:</span>{" "}
                  {[customer.first_name ?? "", customer.last_name ?? ""]
                    .filter(Boolean)
                    .join(" ") || "—"}
                </div>
                <div>
                  <span className="text-neutral-500">Email:</span>{" "}
                  {customer.email ?? "—"}
                </div>
                <div>
                  <span className="text-neutral-500">Phone:</span>{" "}
                  {customer.phone ?? "—"}
                </div>
              </div>

              <div className="mt-3 mb-1 text-[0.7rem] uppercase tracking-[0.16em] text-neutral-500">
                Address
              </div>
              <div className="space-y-1 text-xs text-neutral-200">
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
            <section className="space-y-2 rounded-lg border border-neutral-800 bg-neutral-950/80 px-3 py-3 text-sm">
              <div className="mb-1 flex items-center justify-between">
                <div className="text-[0.7rem] uppercase tracking-[0.16em] text-neutral-500">
                  Vehicles
                </div>
                {vehicles.length > 0 && (
                  <div className="text-[0.7rem] text-neutral-500">
                    {vehicles.length} total
                  </div>
                )}
              </div>

              {vehicles.length === 0 ? (
                <p className="text-xs text-neutral-400">No vehicles yet.</p>
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
                        className="rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-200"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium text-neutral-50">
                            {title || "Vehicle"}
                          </div>
                          {v.license_plate && (
                            <span className="rounded-full border border-neutral-700 px-2 py-0.5 text-[0.65rem] text-neutral-200">
                              {v.license_plate}
                            </span>
                          )}
                        </div>

                        <div className="mt-2 grid grid-cols-2 gap-1 text-[0.7rem] text-neutral-400">
                          <div>
                            <span className="text-neutral-500">VIN:</span>{" "}
                            {v.vin || "—"}
                          </div>
                          <div>
                            <span className="text-neutral-500">Mileage:</span>{" "}
                            {v.mileage || "—"}
                          </div>
                          <div>
                            <span className="text-neutral-500">Unit #:</span>{" "}
                            {v.unit_number || "—"}
                          </div>
                          <div>
                            <span className="text-neutral-500">Color:</span>{" "}
                            {v.color || "—"}
                          </div>
                          <div>
                            <span className="text-neutral-500">Engine hrs:</span>{" "}
                            {v.engine_hours != null ? String(v.engine_hours) : "—"}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Work order history */}
            <section className="space-y-2 rounded-lg border border-neutral-800 bg-neutral-950/80 px-3 py-3 text-sm">
              <div className="mb-1 flex items-center justify-between">
                <div className="text-[0.7rem] uppercase tracking-[0.16em] text-neutral-500">
                  Work Orders
                </div>
                {workOrders.length > 0 && (
                  <div className="text-[0.7rem] text-neutral-500">
                    {workOrders.length} total
                  </div>
                )}
              </div>

              {workOrders.length === 0 ? (
                <p className="text-xs text-neutral-400">
                  No work orders yet for this customer.
                </p>
              ) : (
                <div className="space-y-2">
                  {workOrders.map((wo) => (
                    <button
                      key={wo.id}
                      type="button"
                      onClick={() => router.push(`/mobile/work-orders/${wo.id}`)}
                      className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-left text-xs text-neutral-200 hover:border-orange-500/80"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium text-neutral-50 truncate">
                            {wo.custom_id
                              ? `WO ${wo.custom_id}`
                              : `WO #${wo.id.slice(0, 8)}`}
                          </div>
                          <div className="text-[0.7rem] text-neutral-400">
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
    </MobileShell>
  );
}