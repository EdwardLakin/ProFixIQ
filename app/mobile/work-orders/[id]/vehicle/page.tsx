// app/mobile/work-orders/[id]/vehicle/page.tsx
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
  });

  const [vehicle, setVehicle] = useState<MobileVehicle>({
    id: null,
    year: null,
    make: null,
    model: null,
    license_plate: null,
    mileage: null,
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
            "id, first_name, last_name, phone, phone_number, email",
          )
          .eq("id", woRow.customer_id)
          .maybeSingle();

        if (custErr) throw custErr;

        if (cust) {
          const c = cust as CustomerRow;
          setCustomer({
            id: c.id,
            first_name: (c.first_name as string | null) ?? null,
            last_name: (c.last_name as string | null) ?? null,
            // prefer phone, fall back to phone_number
            phone:
              (c.phone as string | null) ??
              (c.phone_number as string | null) ??
              null,
            email: (c.email as string | null) ?? null,
          });
        }
      }

      // 3) Load vehicle, if linked
      if (woRow.vehicle_id) {
        const { data: veh, error: vehErr } = await supabase
          .from("vehicles")
          .select(
            "id, year, make, model, license_plate, mileage",
          )
          .eq("id", woRow.vehicle_id)
          .maybeSingle();

        if (vehErr) throw vehErr;

        if (veh) {
          const v = veh as VehicleRow;
          setVehicle({
            id: v.id,
            year: (v.year as number | null) ?? null,
            make: (v.make as string | null) ?? null,
            model: (v.model as string | null) ?? null,
            license_plate: (v.license_plate as string | null) ?? null,
            mileage: (v.mileage as string | null) ?? null,
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
    return (
      <div className="p-4 text-sm text-red-300">{error}</div>
    );
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