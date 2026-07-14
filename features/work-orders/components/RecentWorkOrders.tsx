"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/features/shared/lib/supabase/client";
import Card from "@shared/components/ui/Card";
import StatusBadge from "@shared/components/ui/StatusBadge";

type WorkOrder = {
  id: string;
  vehicle_make: string | null;
  vehicle_model: string | null;
  status: string;
  created_at: string;
};

function getVariant(
  status: string,
): "neutral" | "info" | "active" | "warning" | "success" {
  const normalized = status.toLowerCase();

  if (normalized === "in_progress") return "active";
  if (normalized === "on_hold") return "warning";
  if (
    normalized === "completed" ||
    normalized === "ready_to_invoice" ||
    normalized === "invoiced"
  ) {
    return "success";
  }
  if (
    normalized === "awaiting" ||
    normalized === "awaiting_approval" ||
    normalized === "queued"
  ) {
    return "info";
  }
  return "neutral";
}

export default function RecentWorkOrders() {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const router = useRouter();

  useEffect(() => {
    const fetchWorkOrders = async () => {
      const supabase = supabaseBrowser;

      const { data, error } = await supabase
        .from("work_orders")
        .select("id, vehicle_make, vehicle_model, status, created_at")
        .order("created_at", { ascending: false })
        .limit(3);

      if (!error && data) setWorkOrders(data as WorkOrder[]);
      else if (error) console.error("RecentWorkOrders error:", error.message);
    };

    void fetchWorkOrders();
  }, []);

  return (
    <Card className="mb-8 px-5 py-5">
      <div className="mb-4">
        <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[color:var(--theme-text-muted)]">
          Work orders
        </div>
        <h2 className="mt-1 text-base font-semibold text-[color:var(--theme-text-primary)] sm:text-lg">
          Recent work orders
        </h2>
      </div>

      {workOrders.length === 0 ? (
        <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-4 text-sm text-[color:var(--theme-text-secondary)]">
          No recent work orders found.
        </div>
      ) : (
        <ul className="space-y-3">
          {workOrders.map((order) => {
            const vehicleLabel =
              [order.vehicle_make, order.vehicle_model].filter(Boolean).join(" ") ||
              "Vehicle not set";

            return (
              <li key={order.id}>
                <button
                  type="button"
                  onClick={() => router.push(`/work-orders/${order.id}`)}
                  className="flex w-full items-start justify-between gap-3 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 text-left transition hover:border-[color:var(--accent-copper-soft,#fdba74)] hover:bg-[color:var(--theme-surface-inset)]"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-[color:var(--theme-text-primary)]">{vehicleLabel}</div>
                    <div className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                      Status: {order.status.replaceAll("_", " ")}
                    </div>
                  </div>

                  <StatusBadge variant={getVariant(order.status)}>
                    {order.status.replaceAll("_", " ")}
                  </StatusBadge>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
