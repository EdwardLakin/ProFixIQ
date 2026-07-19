"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { supabaseBrowser as supabase } from "@/features/shared/lib/supabase/client";
import MobileCustomerVehicleForm from "@/features/work-orders/mobile/MobileCustomerVehicleForm";
import type {
  MobileCustomer,
  MobileVehicle,
} from "@/features/work-orders/mobile/types";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];
type CustomerRow = DB["public"]["Tables"]["customers"]["Row"];
type VehicleRow = DB["public"]["Tables"]["vehicles"]["Row"];

function toYearValue(value: unknown): string | number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : normalized;
  }
  return null;
}

function toStringOrNull(value: unknown): string | null {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized.length ? normalized : null;
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export default function MobileWorkOrderVehiclePage() {
  const params = useParams<{ id: string }>();
  const workOrderId = params?.id;
  const [workOrder, setWorkOrder] = useState<WorkOrderRow | null>(null);
  const [customer, setCustomer] = useState<MobileCustomer>({
    id: null,
    first_name: null,
    last_name: null,
    phone: null,
    email: null,
    business_name: null,
    address: null,
    city: null,
    province: null,
    postal_code: null,
  });
  const [vehicle, setVehicle] = useState<MobileVehicle>({
    id: null,
    vin: null,
    year: null,
    make: null,
    model: null,
    license_plate: null,
    mileage: null,
    color: null,
    unit_number: null,
    engine_hours: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!workOrderId) return;
    setLoading(true);
    setError(null);

    try {
      const { data: workOrderRow, error: workOrderError } = await supabase
        .from("work_orders")
        .select("id, custom_id, customer_id, vehicle_id, shop_id")
        .eq("id", workOrderId)
        .maybeSingle();
      if (workOrderError) throw workOrderError;
      if (!workOrderRow) {
        setError("Work order not found.");
        return;
      }

      setWorkOrder(workOrderRow as WorkOrderRow);

      if (workOrderRow.customer_id) {
        const { data: customerRow, error: customerError } = await supabase
          .from("customers")
          .select(
            "id, business_name, first_name, last_name, phone, phone_number, email, address, city, province, postal_code",
          )
          .eq("id", workOrderRow.customer_id)
          .maybeSingle();
        if (customerError) throw customerError;

        if (customerRow) {
          const typed = customerRow as CustomerRow;
          setCustomer({
            id: typed.id,
            business_name:
              (typed as CustomerRow & { business_name?: string | null })
                .business_name ?? null,
            first_name: typed.first_name ?? null,
            last_name: typed.last_name ?? null,
            phone:
              typed.phone ??
              (typed as CustomerRow & { phone_number?: string | null })
                .phone_number ??
              null,
            email: typed.email ?? null,
            address:
              (typed as CustomerRow & { address?: string | null }).address ??
              null,
            city:
              (typed as CustomerRow & { city?: string | null }).city ?? null,
            province:
              (typed as CustomerRow & { province?: string | null }).province ??
              null,
            postal_code:
              (typed as CustomerRow & { postal_code?: string | null })
                .postal_code ?? null,
          });
        }
      }

      if (workOrderRow.vehicle_id) {
        const { data: vehicleRow, error: vehicleError } = await supabase
          .from("vehicles")
          .select(
            "id, vin, year, make, model, license_plate, mileage, color, unit_number, engine_hours, engine, transmission, fuel_type, drivetrain",
          )
          .eq("id", workOrderRow.vehicle_id)
          .maybeSingle();
        if (vehicleError) throw vehicleError;

        if (vehicleRow) {
          const typed = vehicleRow as VehicleRow;
          setVehicle({
            id: typed.id,
            vin: (typed as VehicleRow & { vin?: string | null }).vin ?? null,
            year: toYearValue(
              (typed as VehicleRow & { year?: unknown }).year,
            ),
            make: typed.make ?? null,
            model: typed.model ?? null,
            license_plate: typed.license_plate ?? null,
            mileage: toStringOrNull(
              (typed as VehicleRow & { mileage?: unknown }).mileage,
            ),
            color:
              (typed as VehicleRow & { color?: string | null }).color ?? null,
            unit_number:
              (typed as VehicleRow & { unit_number?: string | null })
                .unit_number ?? null,
            engine_hours: toNumberOrNull(
              (typed as VehicleRow & { engine_hours?: unknown }).engine_hours,
            ),
            engine:
              (typed as VehicleRow & { engine?: string | null }).engine ?? null,
            transmission:
              (typed as VehicleRow & { transmission?: string | null })
                .transmission ?? null,
            fuel_type:
              (typed as VehicleRow & { fuel_type?: string | null })
                .fuel_type ?? null,
            drivetrain:
              (typed as VehicleRow & { drivetrain?: string | null })
                .drivetrain ?? null,
          });
        }
      }
    } catch (caught) {
      // eslint-disable-next-line no-console
      console.error("[MobileWorkOrderVehiclePage] fetch error:", caught);
      setError(
        caught instanceof Error
          ? caught.message
          : "Failed to load customer and vehicle information.",
      );
    } finally {
      setLoading(false);
    }
  }, [workOrderId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  if (!workOrderId) {
    return (
      <div className="p-4 text-sm text-red-300">
        Missing work order id in route.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--theme-surface-page)] px-3 py-4 text-[color:var(--theme-text-primary)]">
      <div className="mx-auto max-w-xl space-y-3">
        <div className="flex items-center justify-between gap-3">
          <Link
            href={`/mobile/work-orders/${workOrderId}`}
            className="inline-flex min-h-10 items-center rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 text-xs font-semibold text-[color:var(--theme-text-primary)]"
          >
            ← Work order
          </Link>
          <div className="truncate text-right text-xs text-[color:var(--theme-text-secondary)]">
            {workOrder?.custom_id
              ? `WO ${workOrder.custom_id}`
              : `WO ${workOrderId.slice(0, 8)}`}
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 text-sm text-[color:var(--theme-text-secondary)]">
            Loading customer &amp; vehicle…
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-500/40 bg-red-950/30 p-4 text-sm text-red-200">
            {error}
          </div>
        ) : (
          <MobileCustomerVehicleForm
            wo={workOrder}
            customer={customer}
            vehicle={vehicle}
            onCustomerChange={setCustomer}
            onVehicleChange={setVehicle}
            supabase={supabase}
          />
        )}
      </div>
    </div>
  );
}
