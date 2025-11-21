"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { format } from "date-fns";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { MobileWorkOrderLines } from "@/features/work-orders/mobile/MobileWorkOrderLines";
import { MobileJobLineAdd } from "@/features/work-orders/mobile/MobileJobLineAdd";

type DB = Database;

type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type Customer = DB["public"]["Tables"]["customers"]["Row"];
type Vehicle = DB["public"]["Tables"]["vehicles"]["Row"];
type Line = DB["public"]["Tables"]["work_order_lines"]["Row"];

type FullWO = WorkOrder & {
  customers: Pick<
    Customer,
    "first_name" | "last_name" | "phone" | "email"
  > | null;
  vehicles: Pick<
    Vehicle,
    "year" | "make" | "model" | "license_plate" | "vin"
  > | null;
};

type StatusKey =
  | "awaiting_approval"
  | "awaiting"
  | "queued"
  | "in_progress"
  | "on_hold"
  | "planned"
  | "new"
  | "completed"
  | "ready_to_invoice"
  | "invoiced";

const STATUS_LABEL: Record<StatusKey, string> = {
  awaiting_approval: "Awaiting approval",
  awaiting: "Awaiting",
  queued: "Queued",
  in_progress: "In progress",
  on_hold: "On hold",
  planned: "Planned",
  new: "New",
  completed: "Completed",
  ready_to_invoice: "Ready to invoice",
  invoiced: "Invoiced",
};

const STATUS_CHIP: Record<StatusKey, string> = {
  awaiting_approval:
    "bg-blue-500/10 text-blue-200 border border-blue-400/60",
  awaiting:
    "bg-sky-500/10 text-sky-200 border border-sky-400/60",
  queued:
    "bg-indigo-500/10 text-indigo-200 border border-indigo-400/60",
  in_progress:
    "bg-orange-500/10 text-orange-200 border border-orange-400/70",
  on_hold:
    "bg-amber-500/10 text-amber-200 border border-amber-400/70",
  planned:
    "bg-purple-500/10 text-purple-200 border border-purple-400/70",
  new:
    "bg-neutral-800 text-neutral-100 border border-neutral-600",
  completed:
    "bg-green-500/10 text-green-200 border border-green-400/70",
  ready_to_invoice:
    "bg-emerald-500/10 text-emerald-200 border border-emerald-400/70",
  invoiced:
    "bg-teal-500/10 text-teal-200 border border-teal-400/70",
};

function statusKey(raw: string | null | undefined): StatusKey {
  const key = (raw ?? "awaiting").toLowerCase().replaceAll(" ", "_") as StatusKey;
  if (key in STATUS_LABEL) return key;
  return "awaiting";
}

export default function MobileWorkOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [wo, setWo] = useState<FullWO | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const woId = params?.id;

  const load = useCallback(async () => {
    if (!woId) return;
    setLoading(true);
    setErr(null);

    const { data: woData, error: woErr } = await supabase
      .from("work_orders")
      .select(
        `
        *,
        customers:customers(first_name,last_name,phone,email),
        vehicles:vehicles(year,make,model,license_plate,vin)
      `
      )
      .eq("id", woId)
      .maybeSingle();

    if (woErr) {
      setErr(woErr.message);
      setWo(null);
      setLines([]);
      setLoading(false);
      return;
    }

    const full = woData as FullWO | null;
    setWo(full);

    if (!full) {
      setLines([]);
      setLoading(false);
      return;
    }

    const { data: lineData, error: lineErr } = await supabase
      .from("work_order_lines")
      .select("*")
      .eq("work_order_id", full.id)
      .order("created_at", { ascending: true });

    if (lineErr) {
      setErr(lineErr.message);
      setLines([]);
      setLoading(false);
      return;
    }

    setLines((lineData ?? []) as Line[]);
    setLoading(false);
  }, [woId, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  // refresh when a line is added elsewhere
  useEffect(() => {
    const handler = () => {
      void load();
    };
    window.addEventListener("wo:line-added", handler as EventListener);
    return () => window.removeEventListener("wo:line-added", handler as EventListener);
  }, [load]);

  const handleDeleteLine = useCallback(
    async (lineId: string) => {
      if (!confirm("Remove this job line from the work order?")) return;
      const prev = lines;
      setLines((ls) => ls.filter((l) => l.id !== lineId));

      const { error } = await supabase
        .from("work_order_lines")
        .delete()
        .eq("id", lineId);

      if (error) {
        alert("Failed to delete line: " + error.message);
        setLines(prev);
      }
    },
    [lines, supabase]
  );

  const vehicleId = wo?.vehicle_id ?? null;

  const titleId = wo?.custom_id || (wo ? `#${wo.id.slice(0, 8)}` : "Work order");

  const status = statusKey(wo?.status);

  const customerName = wo?.customers
    ? [wo.customers.first_name ?? "", wo.customers.last_name ?? ""]
        .filter(Boolean)
        .join(" ")
    : "No customer";

  const customerPhone = wo?.customers?.phone ?? null;
  const customerEmail = wo?.customers?.email ?? null;

  const vehicleLabel = wo?.vehicles
    ? `${wo.vehicles.year ?? ""} ${wo.vehicles.make ?? ""} ${
        wo.vehicles.model ?? ""
      }`.trim()
    : "";

  const plate = wo?.vehicles?.license_plate ?? "";
  const vinTail = wo?.vehicles?.vin ? wo.vehicles.vin.slice(-8) : "";

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col bg-gradient-to-b from-black to-neutral-950 px-3 pb-6 pt-4 text-neutral-50">
      {/* Top bar */}
      <header className="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-neutral-700 bg-neutral-950 text-sm text-neutral-200"
        >
          ←
        </button>
        <div className="flex-1 text-center">
          <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">
            Work order
          </div>
          <div className="text-sm font-semibold text-neutral-100">
            {titleId}
          </div>
        </div>
        <div className="w-8" />
      </header>

      {err && (
        <div className="mb-3 rounded-xl border border-red-500/60 bg-red-950/50 px-3 py-2 text-[11px] text-red-100">
          {err}
        </div>
      )}

      {loading && (
        <div className="rounded-2xl border border-white/10 bg-black/60 p-4 text-sm text-neutral-300">
          Loading work order…
        </div>
      )}

      {!loading && !wo && !err && (
        <div className="rounded-2xl border border-dashed border-white/20 bg-black/50 p-5 text-sm text-neutral-400">
          Work order not found.
        </div>
      )}

      {!loading && wo && (
        <div className="flex flex-1 flex-col gap-3">
          {/* Summary card */}
          <section className="space-y-3 rounded-2xl border border-white/10 bg-black/70 p-3 shadow-md shadow-black/60">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 space-y-1">
                <div className="text-[11px] text-neutral-400">
                  {wo.created_at
                    ? format(new Date(wo.created_at), "PPpp")
                    : "—"}
                </div>
                <div className="text-sm font-semibold text-neutral-50">
                  {titleId}
                </div>
              </div>
              <span
                className={
                  "inline-flex items-center rounded-full px-2.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.14em] " +
                  STATUS_CHIP[status]
                }
              >
                {STATUS_LABEL[status]}
              </span>
            </div>

            <div className="space-y-2 rounded-xl border border-neutral-800 bg-neutral-950/80 p-2.5 text-[11px]">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">
                    Customer
                  </div>
                  <div className="text-[11px] font-medium text-neutral-100">
                    {customerName || "No customer"}
                  </div>
                  {customerPhone && (
                    <div className="text-[10px] text-neutral-400">
                      {customerPhone}
                    </div>
                  )}
                  {customerEmail && (
                    <div className="text-[10px] text-neutral-400">
                      {customerEmail}
                    </div>
                  )}
                </div>
              </div>

              <div className="h-px w-full bg-neutral-800/80" />

              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">
                    Vehicle
                  </div>
                  <div className="text-[11px] font-medium text-neutral-100">
                    {vehicleLabel || "No vehicle"}
                  </div>
                  {(plate || vinTail) && (
                    <div className="text-[10px] text-neutral-400">
                      {plate && <span>Plate {plate}</span>}
                      {plate && vinTail && <span className="mx-1">•</span>}
                      {vinTail && <span>VIN …{vinTail}</span>}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Lines list */}
          <section>
            <MobileWorkOrderLines
              lines={lines}
              workOrderId={wo.id}
              onDelete={handleDeleteLine}
            />
          </section>

          {/* Add line */}
          <section>
            <MobileJobLineAdd
              workOrderId={wo.id}
              vehicleId={vehicleId}
              onCreated={load}
            />
          </section>
        </div>
      )}
    </main>
  );
}
