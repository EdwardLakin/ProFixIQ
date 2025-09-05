// app/work-orders/[id]/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { format } from "date-fns";

import PreviousPageButton from "@shared/components/ui/PreviousPageButton";
import { MenuQuickAdd } from "@work-orders/components/MenuQuickAdd";
import SuggestedQuickAdd from "@work-orders/components/SuggestedQuickAdd";

type DB = Database;
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type WorkOrderLine = DB["public"]["Tables"]["work_order_lines"]["Row"];
type Vehicle = DB["public"]["Tables"]["vehicles"]["Row"];
type Customer = DB["public"]["Tables"]["customers"]["Row"];

type ParamsShape = Record<string, string | string[]>;
function paramToString(v: string | string[] | undefined): string | null {
  if (!v) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

const statusBadge: Record<string, string> = {
  awaiting: "bg-blue-100 text-blue-800",
  in_progress: "bg-orange-100 text-orange-800",
  on_hold: "bg-yellow-100 text-yellow-800",
  completed: "bg-green-100 text-green-800",
};

export default function WorkOrderPage() {
  const params = useParams();
  const woId = useMemo(() => {
    const raw = (params as ParamsShape)?.id;
    return paramToString(raw);
  }, [params]);

  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [wo, setWo] = useState<WorkOrder | null>(null);
  const [lines, setLines] = useState<WorkOrderLine[]>([]);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchAll = useCallback(async () => {
    if (!woId) return;
    setLoading(true);

    // 1) Work order
    const { data: woRow, error: woErr } = await supabase
      .from("work_orders")
      .select("*")
      .eq("id", woId)
      .single();

    if (woErr || !woRow) {
      console.error("Work order not found:", woErr?.message);
      setWo(null);
      setLines([]);
      setVehicle(null);
      setCustomer(null);
      setLoading(false);
      return;
    }
    setWo(woRow);

    // 2) Lines for this WO
    const { data: lineRows } = await supabase
      .from("work_order_lines")
      .select("*")
      .eq("work_order_id", woRow.id)
      .order("created_at", { ascending: true });
    setLines(lineRows ?? []);

    // 3) Vehicle
    if (woRow.vehicle_id) {
      const { data: v } = await supabase
        .from("vehicles")
        .select("*")
        .eq("id", woRow.vehicle_id)
        .single();
      setVehicle(v ?? null);
    } else {
      setVehicle(null);
    }

    // 4) Customer
    if (woRow.customer_id) {
      const { data: c } = await supabase
        .from("customers")
        .select("*")
        .eq("id", woRow.customer_id)
        .single();
      setCustomer(c ?? null);
    } else {
      setCustomer(null);
    }

    setLoading(false);
  }, [supabase, woId]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const chipClass = (s: string | null): string => {
    const key = (s ?? "awaiting") as keyof typeof statusBadge;
    return `text-xs px-2 py-1 rounded ${statusBadge[key] ?? "bg-gray-200 text-gray-800"}`;
  };

  if (!woId) {
    return <div className="p-6 text-red-500">Missing work order id.</div>;
  }

  return (
    <div className="p-4 sm:p-6">
      <PreviousPageButton to="/work-orders/queue" />
      {loading && <div className="mt-6 text-white">Loading…</div>}

      {!loading && !wo && (
        <div className="mt-6 text-red-500">Work order not found.</div>
      )}

      {!loading && wo && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
          {/* LEFT: main */}
          <div className="space-y-6">
            {/* Header card */}
            <div className="rounded border border-neutral-800 bg-neutral-900 p-4 text-white">
              <div className="flex items-center justify-between">
                <h1 className="text-2xl font-semibold">
                  Work Order #{wo.id.slice(0, 8)}
                </h1>
                <span className={chipClass(wo.status ?? null)}>
                  {(wo.status ?? "awaiting").replaceAll("_", " ")}
                </span>
              </div>
              <div className="mt-2 text-sm text-neutral-400">
                Created: {wo.created_at ? format(new Date(wo.created_at), "PPpp") : "—"}
              </div>
              {/* If your schema later adds a 'notes' column, you can show it here again */}
            </div>

            {/* Vehicle & Customer */}
            <div className="rounded border border-neutral-800 bg-neutral-900 p-4 text-white">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <h2 className="mb-1 text-lg font-semibold">Vehicle</h2>
                  {vehicle ? (
                    <>
                      <p>
                        {(vehicle.year ?? "").toString()} {vehicle.make ?? ""} {vehicle.model ?? ""}
                      </p>
                      <p className="text-sm text-neutral-400">
                        VIN: {vehicle.vin ?? "—"} • Plate: {vehicle.license_plate ?? "—"}
                      </p>
                    </>
                  ) : (
                    <p className="text-neutral-400">—</p>
                  )}
                </div>
                <div>
                  <h2 className="mb-1 text-lg font-semibold">Customer</h2>
                  {customer ? (
                    <>
                      <p>
                        {[customer.first_name ?? "", customer.last_name ?? ""].filter(Boolean).join(" ") || "—"}
                      </p>
                      <p className="text-sm text-neutral-400">
                        {customer.phone ?? "—"} {customer.email ? `• ${customer.email}` : ""}
                      </p>
                    </>
                  ) : (
                    <p className="text-neutral-400">—</p>
                  )}
                </div>
              </div>
            </div>

            {/* Lines list */}
            <div className="rounded border border-neutral-800 bg-neutral-900 p-4 text-white">
              <h2 className="mb-3 text-lg font-semibold">Jobs in this Work Order</h2>
              {lines.length === 0 ? (
                <p className="text-sm text-neutral-400">No lines yet.</p>
              ) : (
                <div className="space-y-2">
                  {lines.map((ln) => (
                    <div
                      key={ln.id}
                      className="rounded border border-neutral-800 bg-neutral-950 p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate font-medium">
                            {ln.description || ln.complaint || "Untitled job"}
                          </div>
                          <div className="text-xs text-neutral-400">
                            {(ln.job_type ?? "job").replaceAll("_", " ")} • Status:{" "}
                            {(ln.status ?? "awaiting").replaceAll("_", " ")}
                          </div>
                        </div>
                        <span className={chipClass(ln.status ?? null)}>
                          {(ln.status ?? "awaiting").replaceAll("_", " ")}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: actions */}
          <aside className="space-y-6">
            {/* AI suggestions (uses vehicle id only, as expected by the component) */}
            <div className="rounded border border-neutral-800 bg-neutral-900 p-4 text-white">
              <SuggestedQuickAdd
                jobId={lines[0]?.id ?? ""}
                workOrderId={wo.id}
                vehicleId={vehicle?.id ?? null}
              />
            </div>

            {/* Manual quick add */}
            <div className="rounded border border-neutral-800 bg-neutral-900 p-4 text-white">
              <MenuQuickAdd workOrderId={wo.id} />
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}