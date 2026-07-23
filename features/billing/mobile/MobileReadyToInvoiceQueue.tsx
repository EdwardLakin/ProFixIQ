"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import { Button } from "@shared/components/ui/Button";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type Customer = DB["public"]["Tables"]["customers"]["Row"];
type Vehicle = DB["public"]["Tables"]["vehicles"]["Row"];

type BillingWorkOrder = Pick<
  WorkOrder,
  "id" | "custom_id" | "status" | "updated_at" | "created_at"
> & {
  customers: Pick<Customer, "first_name" | "last_name" | "email"> | null;
  vehicles: Pick<Vehicle, "year" | "make" | "model" | "license_plate"> | null;
};

type BillingWorkOrdersResponse =
  | { ok: true; rows: BillingWorkOrder[] }
  | { ok?: false; error?: string };

const READY_FOR_BILLING_STATUSES = new Set(["completed", "ready_to_invoice"]);

function customerLabel(customer: BillingWorkOrder["customers"]): string {
  if (!customer) return "No customer";
  return (
    [customer.first_name, customer.last_name].filter(Boolean).join(" ").trim() ||
    customer.email?.trim() ||
    "Customer"
  );
}

function vehicleLabel(vehicle: BillingWorkOrder["vehicles"]): string {
  if (!vehicle) return "No vehicle";
  const label = [vehicle.year, vehicle.make, vehicle.model]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(" ");
  const plate = vehicle.license_plate?.trim();
  return [label || "Vehicle", plate ? `(${plate})` : ""].filter(Boolean).join(" ");
}

function statusLabel(status: string | null): string {
  return status === "ready_to_invoice" ? "Ready to invoice" : "Completed";
}

export default function MobileReadyToInvoiceQueue() {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [rows, setRows] = useState<BillingWorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);

    try {
      const response = await fetch("/api/billing/work-orders", {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as BillingWorkOrdersResponse;

      if (!response.ok || payload.ok !== true) {
        if (response.status === 401 || response.status === 403) {
          setForbidden(true);
          setRows([]);
          return;
        }
        throw new Error(
          payload.ok === false && payload.error
            ? payload.error
            : "Ready-to-invoice work could not be loaded.",
        );
      }

      setRows(
        payload.rows.filter(
          (row) => row.status != null && READY_FOR_BILLING_STATUSES.has(row.status),
        ),
      );
    } catch (caught: unknown) {
      setRows([]);
      setError(
        caught instanceof Error
          ? caught.message
          : "Ready-to-invoice work could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel("mobile:billing-ready:work-orders")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "work_orders" },
        () => void load(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load, supabase]);

  return (
    <main className="min-h-screen bg-[color:var(--theme-surface-page)] px-4 pb-8 pt-4 text-[color:var(--theme-text-primary)]">
      <div className="mx-auto max-w-4xl space-y-4">
        <section className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4 shadow-[var(--theme-shadow-medium)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
                Billing queue
              </div>
              <h1 className="mt-1 text-xl font-semibold">Ready to invoice</h1>
              <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
                Completed work orders that are ready for billing review.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              isLoading={loading}
              onClick={() => void load()}
            >
              Refresh
            </Button>
          </div>
          <div className="mt-4 text-3xl font-semibold tabular-nums">{rows.length}</div>
        </section>

        {forbidden ? (
          <div className="rounded-2xl border border-amber-400/40 bg-amber-500/10 p-4 text-sm">
            Your role does not have access to the billing queue.
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-400/40 bg-red-500/10 p-4 text-sm">
            {error}
          </div>
        ) : loading ? (
          <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4 text-sm text-[color:var(--theme-text-secondary)]">
            Loading ready-to-invoice work…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4 text-sm text-[color:var(--theme-text-secondary)]">
            No work orders are currently ready for billing.
          </div>
        ) : (
          <section aria-label="Ready-to-invoice work orders" className="space-y-2">
            {rows.map((workOrder) => (
              <Link
                key={workOrder.id}
                href={`/mobile/work-orders/${workOrder.id}`}
                className="block rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4 shadow-[var(--theme-shadow-medium)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold">
                      {workOrder.custom_id
                        ? `WO #${workOrder.custom_id}`
                        : `WO ${workOrder.id.slice(0, 8)}`}
                    </div>
                    <div className="mt-1 truncate text-sm text-[color:var(--theme-text-secondary)]">
                      {customerLabel(workOrder.customers)}
                    </div>
                    <div className="mt-1 truncate text-xs text-[color:var(--theme-text-muted)]">
                      {vehicleLabel(workOrder.vehicles)}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-emerald-200">
                    {statusLabel(workOrder.status)}
                  </span>
                </div>
              </Link>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
