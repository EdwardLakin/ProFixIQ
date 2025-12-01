"use client";

/**
 * Mobile Create Work Order (Companion App)
 * ---------------------------------------------------------------------------
 * Mobile-first create flow:
 * - Auto-creates a placeholder WO tied to Walk-in Customer / Unassigned vehicle
 * - Lets you capture customer + vehicle + lines
 * - VIN scan support
 * - Sends you to the mobile WO detail view on submit
 */

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { v4 as uuidv4 } from "uuid";

import type { Database } from "@shared/types/types/supabase";
import type {
  MobileCustomer,
  MobileVehicle,
} from "@/features/work-orders/mobile/types";

import { MobileCustomerVehicleForm } from "@/features/work-orders/mobile/MobileCustomerVehicleForm";
import { MobileWorkOrderLines } from "@/features/work-orders/mobile/MobileWorkOrderLines";
import { MobileJobLineAdd } from "@/features/work-orders/mobile/MobileJobLineAdd";
import { useWorkOrderDraft } from "app/work-orders/state/useWorkOrderDraft";
import VinCaptureModal from "app/vehicle/VinCaptureModal";

type DB = Database;
type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];
type WorkOrderLineRow = DB["public"]["Tables"]["work_order_lines"]["Row"];
type CustomerRow = DB["public"]["Tables"]["customers"]["Row"];
type VehicleRow = DB["public"]["Tables"]["vehicles"]["Row"];

type DraftCustomerShape = {
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  email?: string | null;
};

type DraftVehicleShape = {
  vin?: string | null;
  year?: string | null;
  make?: string | null;
  model?: string | null;
  license_plate?: string | null;
  plate?: string | null;
};

/* -------------------------------------------------------------------------- */
/* Helpers (mirrored from desktop create page)                                */
/* -------------------------------------------------------------------------- */

function getInitials(
  first?: string | null,
  last?: string | null,
  fallback?: string | null,
): string {
  const f = (first ?? "").trim();
  const l = (last ?? "").trim();
  if (f || l) return `${f[0] ?? ""}${l[0] ?? ""}`.toUpperCase() || "WO";
  const fb = (fallback ?? "").trim();
  if (fb.includes("@")) {
    return fb.split("@")[0].slice(0, 2).toUpperCase() || "WO";
  }
  return fb.slice(0, 2).toUpperCase() || "WO";
}

async function generateCustomId(
  supabase: ReturnType<typeof createClientComponentClient<DB>>,
  prefix: string,
): Promise<string> {
  const p = prefix.replace(/[^A-Z]/g, "").slice(0, 3) || "WO";
  const { data } = await supabase
    .from("work_orders")
    .select("custom_id")
    .ilike("custom_id", `${p}%`)
    .order("created_at", { ascending: false })
    .limit(50);

  let max = 0;
  (data ?? []).forEach((r) => {
    const cid = r.custom_id ?? "";
    const m = cid.match(/^([A-Z]+)(\d{1,})$/i);
    if (m && m[1].toUpperCase() === p) {
      const n = parseInt(m[2], 10);
      if (!Number.isNaN(n)) max = Math.max(max, n);
    }
  });

  const next = (max + 1).toString().padStart(4, "0");
  return `${p}${next}`;
}

/**
 * Resolve the user's shop_id.
 * - First tries profiles.id = userId
 * - If none, tries shops.owner_id = userId and writes back to profile
 */
async function getOrLinkShopId(
  supabase: ReturnType<typeof createClientComponentClient<DB>>,
  userId: string,
): Promise<string | null> {
  const { data: profileById, error: profErr } = await supabase
    .from("profiles")
    .select("shop_id")
    .eq("id", userId)
    .maybeSingle();

  if (profErr) throw profErr;
  if (profileById?.shop_id) return profileById.shop_id;

  const { data: ownedShop, error: shopErr } = await supabase
    .from("shops")
    .select("id")
    .eq("owner_id", userId)
    .maybeSingle();

  if (shopErr) throw shopErr;
  if (!ownedShop?.id) return null;

  const { error: updErr } = await supabase
    .from("profiles")
    .update({ shop_id: ownedShop.id })
    .eq("id", userId);

  if (updErr) throw updErr;
  return ownedShop.id;
}

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
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  /* ------------------------------------------------------------------------ */
  /* Hydrate from shared VIN / OCR draft (desktop + mobile shared store)      */
  /* ------------------------------------------------------------------------ */
  useEffect(() => {
    const draftCustomer = (draft.customer ?? null) as DraftCustomerShape | null;
    const draftVehicle = (draft.vehicle ?? null) as DraftVehicleShape | null;

    const hasCust =
      draftCustomer != null &&
      Object.values(draftCustomer).some((v) => v != null && v !== "");
    const hasVeh =
      draftVehicle != null &&
      Object.values(draftVehicle).some((v) => v != null && v !== "");

    if (hasCust && draftCustomer) {
      setCustomer((prev) => ({
        ...prev,
        first_name: draftCustomer.first_name ?? prev.first_name,
        last_name: draftCustomer.last_name ?? prev.last_name,
        phone: draftCustomer.phone ?? prev.phone,
        email: draftCustomer.email ?? prev.email,
      }));
    }

    if (hasVeh && draftVehicle) {
      setVehicle((prev) => ({
        ...prev,
        vin: draftVehicle.vin ?? prev.vin,
        year: draftVehicle.year ?? prev.year,
        make: draftVehicle.make ?? prev.make,
        model: draftVehicle.model ?? prev.model,
        license_plate:
          draftVehicle.license_plate ??
          draftVehicle.plate ??
          prev.license_plate,
      }));
    }

    if (hasVeh || hasCust) {
      draft.reset();
    }
  }, [draft]);

  /* ------------------------------------------------------------------------ */
  /* Resolve current user id (for VIN modal)                                  */
  /* ------------------------------------------------------------------------ */
  useEffect(() => {
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setCurrentUserId(user?.id ?? null);
    })();
  }, [supabase]);

  /* ------------------------------------------------------------------------ */
  /* Auto-create placeholder WO (aligned with desktop Create)                 */
  /* ------------------------------------------------------------------------ */
  useEffect(() => {
    void (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user?.id) return;

        const shopId = await getOrLinkShopId(supabase, user.id);
        if (!shopId) return;

        // Ensure Walk-in Customer
        let placeholderCustomer: CustomerRow | null = null;

        const { data: customers } = await supabase
          .from("customers")
          .select("*")
          .eq("shop_id", shopId)
          .ilike("first_name", "Walk-in")
          .ilike("last_name", "Customer")
          .limit(1);

        if (customers && customers.length > 0) {
          placeholderCustomer = customers[0] as CustomerRow;
        } else {
          const { data } = await supabase
            .from("customers")
            .insert({
              first_name: "Walk-in",
              last_name: "Customer",
              shop_id: shopId,
            })
            .select("*")
            .single();
          placeholderCustomer = (data as CustomerRow) ?? null;
        }

        if (!placeholderCustomer) return;

        // Ensure Unassigned vehicle
        let placeholderVehicle: VehicleRow | null = null;
        const { data: vehicles } = await supabase
          .from("vehicles")
          .select("*")
          .eq("customer_id", placeholderCustomer.id)
          .eq("shop_id", shopId)
          .ilike("model", "Unassigned")
          .limit(1);

        if (vehicles && vehicles.length > 0) {
          placeholderVehicle = vehicles[0] as VehicleRow;
        } else {
          const { data } = await supabase
            .from("vehicles")
            .insert({
              customer_id: placeholderCustomer.id,
              shop_id: shopId,
              make: "—",
              model: "Unassigned",
            })
            .select("*")
            .single();
          placeholderVehicle = (data as VehicleRow) ?? null;
        }

        if (!placeholderVehicle) return;

        // Generate custom_id like desktop
        const initials = getInitials(
          placeholderCustomer.first_name,
          placeholderCustomer.last_name,
          user.email,
        );
        const customId = await generateCustomId(supabase, initials);

        const newId = uuidv4();

        const { data: inserted, error: insertErr } = await supabase
          .from("work_orders")
          .insert({
            id: newId,
            custom_id: customId,
            user_id: user.id,
            shop_id: shopId,
            customer_id: placeholderCustomer.id,
            vehicle_id: placeholderVehicle.id,
            status: "awaiting_approval",
            priority: 3,
          })
          .select("*")
          .single();

        if (insertErr || !inserted) {
          throw new Error(insertErr?.message ?? "Failed to create work order.");
        }

        setWo(inserted as WorkOrderRow);

        // Seed local state
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
          license_plate:
            placeholderVehicle.license_plate ?? prev.license_plate,
        }));
      } catch (e) {
        const msg =
          e instanceof Error
            ? e.message
            : "Failed to auto-create mobile work order.";
        setError(msg);
      }
    })();
  }, [supabase]);

  /* ------------------------------------------------------------------------ */
  /* Fetch lines for this WO                                                  */
  /* ------------------------------------------------------------------------ */
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

    // realtime refresh when lines change
    const ch = supabase
      .channel(`m:create-wo:${wo.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "work_order_lines",
          filter: `work_order_id=eq.${wo.id}`,
        },
        () => {
          void fetchLines();
        },
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(ch);
      } catch {
        /* noop */
      }
    };
  }, [wo?.id, supabase, fetchLines]);

  /* ------------------------------------------------------------------------ */
  /* Submit → go to mobile WO detail                                          */
  /* ------------------------------------------------------------------------ */
  const handleSubmit = async () => {
    if (!wo?.id) return;
    setLoading(true);
    setError(null);

    try {
      // If the VIN / OCR draft has anything, it is already reflected in vehicle state.
      if (draft?.customer || draft?.vehicle) {
        // Mobile create currently relies on the detail page to finish deep persistence.
      }

      router.push(`/mobile/work-orders/${wo.id}`);
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Failed to continue to work order.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  /* ------------------------------------------------------------------------ */
  /* UI                                                                       */
  /* ------------------------------------------------------------------------ */
  return (
    <div className="px-4 py-4">
      <div className="mx-auto max-w-xl space-y-6">
        {/* Header card */}
        <section className="metal-panel metal-panel--card rounded-2xl border border-white/10 px-4 py-4 shadow-card text-white">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-lg font-blackops tracking-[0.16em] text-[var(--accent-copper-light)]">
                Create Work Order
              </h1>
              <p className="mt-1 text-[0.75rem] text-neutral-300">
                Start a new ticket from the lane.
              </p>
            </div>
            {wo?.custom_id && (
              <div className="rounded-full border border-white/15 bg-black/40 px-3 py-1 text-[0.7rem] font-mono text-neutral-100">
                WO&nbsp;
                <span className="text-[var(--accent-copper-soft)]">
                  {wo.custom_id}
                </span>
              </div>
            )}
          </div>
          {error && (
            <p className="mt-3 rounded-lg border border-red-500/50 bg-red-950/70 px-3 py-2 text-[0.7rem] text-red-100">
              {error}
            </p>
          )}
        </section>

        {/* Customer + Vehicle Form */}
        <div className="glass-card rounded-2xl border border-white/10 px-3 py-3">
          <MobileCustomerVehicleForm
            wo={wo}
            customer={customer}
            vehicle={vehicle}
            onCustomerChange={setCustomer}
            onVehicleChange={setVehicle}
            supabase={supabase}
          />

          {/* VIN scan (reads decoded VIN and patches local + draft state) */}
          <div className="mt-3 flex flex-wrap gap-2">
            <VinCaptureModal
              userId={currentUserId ?? "anon"}
              action="/api/vin"
              onDecoded={(decoded) => {
                // store in shared draft (used by desktop + other flows)
                draft.setVehicle({
                  vin: decoded.vin ?? null,
                  year: decoded.year ?? null,
                  make: decoded.make ?? null,
                  model: decoded.model ?? null,
                });

                // patch local mobile vehicle state
                setVehicle((prev) => ({
                  ...prev,
                  vin: decoded.vin ?? prev.vin,
                  year: decoded.year ?? prev.year,
                  make: decoded.make ?? prev.make,
                  model: decoded.model ?? prev.model,
                }));
              }}
            >
              <span className="cursor-pointer rounded-full border border-[var(--accent-copper)] px-3 py-1.5 text-[0.7rem] font-medium text-[var(--accent-copper-light)] hover:bg-[var(--accent-copper)]/10">
                Add by VIN / Scan
              </span>
            </VinCaptureModal>
          </div>
        </div>

        {/* Job Lines */}
        <MobileWorkOrderLines
          lines={lines}
          workOrderId={wo?.id ?? null}
          onDelete={async (lineId) => {
            if (!wo?.id) return;
            await supabase
              .from("work_order_lines")
              .delete()
              .eq("id", lineId)
              .eq("work_order_id", wo.id);
            await fetchLines();
          }}
        />

        {/* Add a Line */}
        <div className="glass-card rounded-2xl border border-white/10 px-3 py-3">
          <MobileJobLineAdd
            workOrderId={wo?.id ?? null}
            vehicleId={vehicle.id}
            defaultJobType="diagnosis"
            onCreated={fetchLines}
          />
        </div>

        {/* Continue */}
        <button
          disabled={loading || !wo?.id}
          onClick={handleSubmit}
          className="w-full rounded-full bg-[var(--accent-copper)] py-3 text-sm font-semibold text-black shadow-[0_0_25px_rgba(0,0,0,0.9)] transition active:opacity-85 disabled:opacity-60"
        >
          {loading ? "Saving…" : "Approve & Continue"}
        </button>
      </div>
    </div>
  );
}