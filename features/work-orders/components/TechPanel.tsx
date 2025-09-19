"use client";
import * as React from "react";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
export type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
export type WorkOrderLine = DB["public"]["Tables"]["work_order_lines"]["Row"];
export type Vehicle = DB["public"]["Tables"]["vehicles"]["Row"];
export type Customer = DB["public"]["Tables"]["customers"]["Row"];

export default function TechPanel({
  workOrder,
  vehicle,
  customer,
  lines,
  onRefresh,
}: {
  workOrder: WorkOrder;
  vehicle: Vehicle | null;
  customer: Customer | null;
  lines: WorkOrderLine[];
  onRefresh: () => void | Promise<void>;
}) {
  // TODO: move your punch in/out, notes, parts modal, quote PDF, photos, DTC/AI suggestions here.
  return (
    <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
      <div className="mb-2 font-semibold text-orange-400">Tech Panel</div>
      <p className="text-sm text-neutral-300">
        Work on <strong>{workOrder.custom_id || workOrder.id.slice(0,8)}</strong>.{" "}
        Vehicle: {vehicle ?  : "—"} ·{" "}
        Customer: {customer ? [customer.first_name ?? "", customer.last_name ?? ""].filter(Boolean).join(" ") : "—"}.
      </p>
      <p className="mt-2 text-sm text-neutral-400">Jobs: {lines.length}</p>
      <div className="mt-3">
        <button
          onClick={() => void onRefresh()}
          className="rounded border border-neutral-700 px-3 py-1.5 text-sm hover:border-orange-500"
        >
          Refresh
        </button>
      </div>
      <div className="mt-4 text-xs text-neutral-500">
        Placeholder: wire your existing tech UI (punch, cause/correction, add job/quote, AI suggestions, photos) here.
      </div>
    </div>
  );
}
