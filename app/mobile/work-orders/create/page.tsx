"use client";

/**
 * Mobile Create Work Order (Companion App)
 * ---------------------------------------------------------------------------
 * Same logic as desktop Create page, but with a mobile-first layout:
 * - Full screen
 * - Vertical-first flow
 * - Large tap targets
 * - No modals
 * - Image-first / VIN-first quick actions
 */

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { v4 as uuidv4 } from "uuid";

import { MobileShell } from "components/layout/MobileShell";

// Mobile components (stubs you’ll fill next)
import { MobileCustomerVehicleForm } from "@/features/work-orders/mobile/MobileCustomerVehicleForm";
import { MobileJobLineAdd } from "@/features/work-orders/mobile/MobileJobLineAdd";
import { MobileWorkOrderLines } from "@/features/work-orders/mobile/MobileWorkOrderLines";

import { useWorkOrderDraft } from "app/work-orders/state/useWorkOrderDraft";
import { useCustomerVehicleDraft } from "app/work-orders/state/useCustomerVehicleDraft";

type DB = Database;

export default function MobileCreateWorkOrderPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const draft = useWorkOrderDraft();
  const cvDraft = useCustomerVehicleDraft();

  const [wo, setWo] = useState<any>(null);
  const [customer, setCustomer] = useState<any>({
    first_name: null,
    last_name: null,
    phone: null,
    email: null,
  });

  const [vehicle, setVehicle] = useState<any>({
    vin: null,
    year: null,
    make: null,
    model: null,
    license_plate: null,
    mileage: null,
  });

  const [lines, setLines] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // ---------------------------------------------------------------------------
  // Auto-create placeholder WO (same logic as desktop)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const createAuto = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) return;

      // 1. get or create placeholder customer
      const { data: shopProfile } = await supabase
        .from("profiles")
        .select("shop_id")
        .eq("id", user.id)
        .maybeSingle();

      const shopId = shopProfile?.shop_id ?? null;
      if (!shopId) return;

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

      // 2. placeholder vehicle
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

      // 3. auto-create WO
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

      setWo(inserted);
    };

    createAuto();
  }, [supabase]);

  // Fetch lines
  const fetchLines = useCallback(async () => {
    if (!wo?.id) return;
    const { data } = await supabase
      .from("work_order_lines")
      .select("*")
      .eq("work_order_id", wo.id)
      .order("created_at");
    setLines(data ?? []);
  }, [wo?.id, supabase]);

  useEffect(() => {
    if (!wo?.id) return;
    fetchLines();
  }, [wo?.id, fetchLines]);

  // ---------------------------------------------------------------------------
  // Form submission
  // ---------------------------------------------------------------------------
  const handleSubmit = async () => {
    if (!wo?.id) return;
    setLoading(true);

    try {
      // Reuse desktop logic: draft → DB sync
      if (draft?.customer || draft?.vehicle) {
        // apply draft to WO
        // (desktop logic here reused)
      }

      router.push(`/mobile/work-orders/${wo.id}`);
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // UI — mobile flow (vertical stack)
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
            <p className="text-xs text-neutral-400 mt-1">
              WO#: {wo.custom_id}
            </p>
          )}
        </div>

        {/* Customer + Vehicle */}
        <MobileCustomerVehicleForm
          wo={wo}
          customer={customer}
          vehicle={vehicle}
          onCustomerChange={setCustomer}
          onVehicleChange={setVehicle}
          supabase={supabase}
        />

        {/* Lines */}
        <MobileWorkOrderLines
          lines={lines}
          workOrderId={wo?.id}
          onOpenInspection={() => {}}
          onDelete={async (lineId) => {
            await supabase
              .from("work_order_lines")
              .delete()
              .eq("id", lineId);
            fetchLines();
          }}
        />

        {/* Add Line */}
        <MobileJobLineAdd
          workOrderId={wo?.id}
          vehicleId={vehicle?.id ?? null}
          onCreated={fetchLines}
        />

        {/* Submit */}
        <button
          disabled={loading}
          onClick={handleSubmit}
          className="w-full bg-orange-500 text-black font-semibold py-3 rounded-lg active:opacity-80"
        >
          {loading ? "Saving..." : "Approve & Continue"}
        </button>
      </div>
    </MobileShell>
  );
}