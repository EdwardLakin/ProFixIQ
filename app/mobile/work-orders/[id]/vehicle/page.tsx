// app/mobile/work-orders/[id]/vehicle/page.tsx (FULL FILE REPLACEMENT)
"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { supabaseBrowser as supabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";

import MobileCustomerVehicleForm from "@/features/work-orders/mobile/MobileCustomerVehicleForm";
import type {
  MobileCustomer,
  MobileVehicle,
} from "@/features/work-orders/mobile/types";

type DB = Database;
type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];
type CustomerRow = DB["public"]["Tables"]["customers"]["Row"];
type VehicleRow = DB["public"]["Tables"]["vehicles"]["Row"];

function toYearValue(v: unknown): string | number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : s;
  }
  return null;
}

function toStrOrNull(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length ? s : null;
}

function toNumOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export default function MobileWorkOrderVehiclePage() {
  const params = useParams<{ id: string }>();
  const workOrderId = params?.id;

  const [wo, setWo] = useState<WorkOrderRow | null>(null);

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

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!workOrderId) return;

    setLoading(true);
    setError(null);

    try {
      // 1) Load the work order (just the fields we care about)
      const { data: woRow, error: woErr } = await supabase
        .from("work_orders")
        .select("id, custom_id, customer_id, vehicle_id, shop_id")
        .eq("id", workOrderId)
        .maybeSingle();

      if (woErr) throw woErr;

      if (!woRow) {
        setError("Work order not found.");
        setLoading(false);
        return;
      }

      setWo(woRow as WorkOrderRow);

      // 2) Load customer, if linked
      if (woRow.customer_id) {
        const { data: cust, error: custErr } = await supabase
          .from("customers")
          .select(
            "id, business_name, first_name, last_name, phone, phone_number, email, address, city, province, postal_code",
          )
          .eq("id", woRow.customer_id)
          .maybeSingle();

        if (custErr) throw custErr;

        if (cust) {
          const c = cust as CustomerRow;
          setCustomer({
            id: c.id,
            business_name: (c as unknown as { business_name?: string | null })
              .business_name ?? null,
            first_name: (c.first_name as string | null) ?? null,
            last_name: (c.last_name as string | null) ?? null,
            // prefer phone, fall back to phone_number
            phone:
              (c.phone as string | null) ??
              ((c as unknown as { phone_number?: string | null }).phone_number ??
                null),
            email: (c.email as string | null) ?? null,
            address: (c as unknown as { address?: string | null }).address ?? null,
            city: (c as unknown as { city?: string | null }).city ?? null,
            province: (c as unknown as { province?: string | null }).province ?? null,
            postal_code:
              (c as unknown as { postal_code?: string | null }).postal_code ??
              null,
          });
        }
      }

      // 3) Load vehicle, if linked
      if (woRow.vehicle_id) {
        const { data: veh, error: vehErr } = await supabase
          .from("vehicles")
          .select(
            "id, vin, year, make, model, license_plate, mileage, color, unit_number, engine_hours, engine, transmission, fuel_type, drivetrain",
          )
          .eq("id", woRow.vehicle_id)
          .maybeSingle();

        if (vehErr) throw vehErr;

        if (veh) {
          const v = veh as VehicleRow;

          setVehicle({
            id: v.id,
            vin: (v as unknown as { vin?: string | null }).vin ?? null,
            year: toYearValue((v as unknown as { year?: unknown }).year),
            make: (v.make as string | null) ?? null,
            model: (v.model as string | null) ?? null,
            license_plate: (v.license_plate as string | null) ?? null,
            mileage: toStrOrNull((v as unknown as { mileage?: unknown }).mileage),
            color: (v as unknown as { color?: string | null }).color ?? null,
            unit_number:
              (v as unknown as { unit_number?: string | null }).unit_number ??
              null,
            engine_hours:
              toNumOrNull((v as unknown as { engine_hours?: unknown }).engine_hours) ??
              null,
            // these are optional in MobileVehicle type, but if your DB has them, keep them too
            engine: (v as unknown as { engine?: string | null }).engine ?? null,
            transmission:
              (v as unknown as { transmission?: string | null }).transmission ??
              null,
            fuel_type:
              (v as unknown as { fuel_type?: string | null }).fuel_type ?? null,
            drivetrain:
              (v as unknown as { drivetrain?: string | null }).drivetrain ?? null,
          });
        }
      }
    } catch (e) {
      console.error("[MobileWorkOrderVehiclePage] fetch error:", e);
      const msg =
        e instanceof Error
          ? e.message
          : "Failed to load customer/vehicle info.";
      setError(msg);
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

  if (loading) {
    return (
      <div className="p-4 text-sm text-neutral-200">
        Loading customer &amp; vehicle…
      </div>
    );
  }

  if (error) {
    return <div className="p-4 text-sm text-red-300">{error}</div>;
  }

  return (
    <div className="min-h-screen bg-[#020617] px-3 py-4 text-white">
      <div className="mx-auto max-w-xl">
        <MobileCustomerVehicleForm
          wo={wo}
          customer={customer}
          vehicle={vehicle}
          onCustomerChange={setCustomer}
          onVehicleChange={setVehicle}
          supabase={supabase}
        />
      </div>
    </div>
  );
}