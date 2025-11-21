"use client";

/**
 * Mobile Create Work Order (Companion App)
 * ---------------------------------------------------------------------------
 * Same logic as desktop Create page, but with a mobile-first layout:
 * - Full screen
 * - Vertical-first flow
 * - Large tap targets
 * - No modals
 * - Quick customer/vehicle capture
 */

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { v4 as uuidv4 } from "uuid";

import type {
  MobileCustomer,
  MobileVehicle,
} from "@/features/work-orders/mobile/types";

import { MobileShell } from "components/layout/MobileShell";
import { MobileCustomerVehicleForm } from "@/features/work-orders/mobile/MobileCustomerVehicleForm";
import { MobileWorkOrderLines } from "@/features/work-orders/mobile/MobileWorkOrderLines";
import { MobileJobLineAdd } from "@/features/work-orders/mobile/MobileJobLineAdd";

import { useWorkOrderDraft } from "app/work-orders/state/useWorkOrderDraft";

type DB = Database;
type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];
type WorkOrderLineRow = DB["public"]["Tables"]["work_order_lines"]["Row"];

export default function MobileCreateWorkOrderPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const draft = useWorkOrderDraft();

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
    vin: null,
    year: null,
    make: null,
    model: null,
    license_plate: null,
    mileage: null,
    color: null,
  });

  const [lines, setLines] = useState<WorkOrderLineRow[]>([]);
  const [loading, setLoading] = useState(false);

  // ---------------------------------------------------------------------------
  // Auto-create placeholder WO (same logic as desktop Create page)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.id) return;

      // Get shop_id
      const { data: shopProfile } = await supabase
        .from("profiles")
        .select("shop_id")
        .eq("id", user.id)
        .maybeSingle();

      const shopId = shopProfile?.shop_id ?? null;
      if (!shopId) return;

      // Placeholder customer
      const { data: customers } = await supabase
        .from("customers")
        .select("*")
        .eq("shop_id", shopId)
        .ilike("first_name", "Walk-in")
        .ilike("last_name", "Customer")
        .limit(1);

      const placeholderCustomer =
        customers?.[0] ??
        (
          await supabase
            .from("customers")
            .insert({
              first_name: "Walk-in",
              last_name: "Customer",
              shop_id: shopId,
            })
            .select("*")
            .single()
        ).data;

      if (!placeholderCustomer) return;

      // Placeholder vehicle
      const { data: vehicles } = await supabase
        .from("vehicles")
        .select("*")
        .eq("customer_id", placeholderCustomer.id)
        .ilike("model", "Unassigned")
        .limit(1);

      const placeholderVehicle =
        vehicles?.[0] ??
        (
          await supabase
            .from("vehicles")
            .insert({
              customer_id: placeholderCustomer.id,
              shop_id: shopId,
              make: "—",
              model: "Unassigned",
            })
            .select("*")
            .single()
        ).data;

      if (!placeholderVehicle) return;

      // Auto-create WO
      const initials = "WO";
      const newId = uuidv4();

      const { data: inserted } = await supabase
        .from("work_orders")
        .insert({
          id: newId,
          custom_id: `${initials}${Math.floor(Math.random() * 9000 + 1000)}`,
          user_id: user.id,
          shop_id: shopId,
          customer_id: placeholderCustomer.id,
          vehicle_id: placeholderVehicle.id,
          status: "awaiting_approval",
          priority: 3,
        })
        .select("*")
        .single();

      if (inserted) {
        setWo(inserted);

        setCustomer((prev) => ({
          ...prev,
          id: placeholderCustomer.id,
          first_name: placeholderCustomer.first_name ?? prev.first_name,
          last_name: placeholderCustomer.last_name ?? prev.last_name,
        }));

        setVehicle((prev) => ({
          ...prev,
          id: placeholderVehicle.id,
          make: placeholderVehicle.make ?? prev.make,
          model: placeholderVehicle.model ?? prev.model,
        }));
      }
    })();
  }, [supabase]);

  // ---------------------------------------------------------------------------
  // Fetch lines for this WO
  // ---------------------------------------------------------------------------
  const fetchLines = useCallback(async () => {
    if (!wo?.id) return;

    const { data } = await supabase
      .from("work_order_lines")
      .select("*")
      .eq("work_order_id", wo.id)
      .order("created_at");

    setLines((data ?? []) as WorkOrderLineRow[]);
  }, [wo?.id, supabase]);

  useEffect(() => {
    if (!wo?.id) return;
    void fetchLines();
  }, [wo?.id, fetchLines]);

  // ---------------------------------------------------------------------------
  // Submit (go to full WO details)
  // ---------------------------------------------------------------------------
  const handleSubmit = async () => {
    if (!wo?.id) return;
    setLoading(true);

    try {
      if (draft?.customer || draft?.vehicle) {
        // TODO: replicate desktop logic here if needed
      }

      router.push(`/mobile/work-orders/${wo.id}`);
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------
  return (
    <MobileShell>
      <div className="px-4 py-4 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl font-blackops text-orange-400">
            Create Work Order
          </h1>
          {wo?.custom_id && (
            <p className="mt-1 text-xs text-neutral-400">WO#: {wo.custom_id}</p>
          )}
        </div>

        {/* Customer + Vehicle Form */}
        <MobileCustomerVehicleForm
          wo={wo}
          customer={customer}
          vehicle={vehicle}
          onCustomerChange={setCustomer}
          onVehicleChange={setVehicle}
          supabase={supabase}
        />

        {/* Job Lines */}
        <MobileWorkOrderLines
          lines={lines}
          workOrderId={wo?.id ?? null}
          onDelete={async (lineId) => {
            await supabase
              .from("work_order_lines")
              .delete()
              .eq("id", lineId);

            await fetchLines();
          }}
        />

        {/* Add a Line */}
        <MobileJobLineAdd
          workOrderId={wo?.id ?? null}
          vehicleId={vehicle.id}
          defaultJobType="diagnosis"
          onCreated={fetchLines}
        />

        {/* Continue */}
        <button
          disabled={loading}
          onClick={handleSubmit}
          className="w-full rounded-lg bg-orange-500 py-3 font-semibold text-black active:opacity-80"
        >
          {loading ? "Saving..." : "Approve & Continue"}
        </button>
      </div>
    </MobileShell>
  );
}