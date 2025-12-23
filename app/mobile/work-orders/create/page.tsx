// app/mobile/work-orders/create/page.tsx
"use client";

/**
 * Mobile Create Work Order (Companion App)
 * ---------------------------------------------------------------------------
 * Stripped, functional flow (aligned with desktop create):
 * - NO auto-created placeholder work order
 * - Resolve shop_id from profile (or link via shops.owner_id)
 * - Search/select existing Customer + Vehicle from DB (scoped to shop)
 * - Create Work Order only when user taps "Create / Continue"
 * - Then allow adding lines + continue to mobile WO detail
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import type { Database } from "@shared/types/types/supabase";
import type {
  MobileCustomer,
  MobileVehicle,
} from "@/features/work-orders/mobile/types";

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
  engine?: string | null;
  fuel_type?: string | null;
  drivetrain?: string | null;
  transmission?: string | null;
};

function strOrNull(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length ? s : null;
}

function numStringOrNull(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
  if (!s) return null;
  return s;
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

/* -------------------------------------------------------------------------- */
/* DB-backed Customer Search (scoped to shop)                                 */
/* -------------------------------------------------------------------------- */

type CustomerPick = {
  id: string;
  business_name: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
};

function formatCustomerTitle(c: CustomerPick): string {
  const person = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  return c.business_name || person || "Unnamed";
}

function formatCustomerSub(c: CustomerPick): string {
  const bits = [c.phone, c.email].filter(Boolean).join(" · ");
  const person = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  if (c.business_name && person) return person;
  return bits || "—";
}

function CustomerSearch({
  supabase,
  shopId,
  value,
  onPick,
}: {
  supabase: ReturnType<typeof createClientComponentClient<DB>>;
  shopId: string | null;
  value: string;
  onPick: (c: CustomerPick) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<CustomerPick[]>([]);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const reqCounter = useRef(0);

  useEffect(() => {
    const term = value.trim();
    if (!shopId || term.length < 2) {
      setRows([]);
      setOpen(false);
      return;
    }

    setOpen(true);
    const thisReq = ++reqCounter.current;

    const t = window.setTimeout(async () => {
      setBusy(true);
      try {
        const like = `%${term}%`;
        const { data, error } = await supabase
          .from("customers")
          .select("id,business_name,first_name,last_name,phone,email,created_at")
          .eq("shop_id", shopId)
          .or(
            [
              `business_name.ilike.${like}`,
              `first_name.ilike.${like}`,
              `last_name.ilike.${like}`,
              `phone.ilike.${like}`,
              `email.ilike.${like}`,
            ].join(","),
          )
          .order("created_at", { ascending: false })
          .limit(12);

        if (error) throw error;
        if (thisReq === reqCounter.current) {
          setRows((data ?? []) as CustomerPick[]);
        }
      } catch {
        if (thisReq === reqCounter.current) setRows([]);
      } finally {
        if (thisReq === reqCounter.current) setBusy(false);
      }
    }, 150);

    return () => window.clearTimeout(t);
  }, [value, shopId, supabase]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  if (!open && !busy) return null;

  return (
    <div ref={wrapRef} className="relative">
      <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-white/15 bg-black/80 backdrop-blur-xl shadow-lg shadow-black/70">
        {busy && (
          <div className="px-3 py-2 text-xs text-neutral-300">Searching…</div>
        )}
        {rows.map((c) => (
          <button
            key={c.id}
            type="button"
            className="block w-full px-3 py-2 text-left text-sm transition hover:bg-[var(--accent-copper)]/15 hover:text-neutral-50"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onPick(c);
              setOpen(false);
            }}
          >
            <div className="truncate text-neutral-100">{formatCustomerTitle(c)}</div>
            <div className="truncate text-xs text-neutral-400">{formatCustomerSub(c)}</div>
          </button>
        ))}
        {!busy && rows.length === 0 && (
          <div className="px-3 py-2 text-xs text-neutral-400">No matches</div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* DB-backed Vehicle Search (scoped to shop + customer)                        */
/* -------------------------------------------------------------------------- */

type VehiclePick = {
  id: string;
  unit_number: string | null;
  license_plate: string | null;
  vin: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  mileage: string | null;
  color: string | null;
};

function formatVehicleTitle(v: VehiclePick): string {
  return (
    v.unit_number ||
    v.license_plate ||
    (v.vin ? v.vin.slice(-8) : null) ||
    [v.year, v.make, v.model].filter(Boolean).join(" ") ||
    "Vehicle"
  );
}

function formatVehicleSub(v: VehiclePick): string {
  return [
    v.license_plate,
    v.vin ? v.vin.slice(-8) : null,
    [v.year, v.make, v.model].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(" · ");
}

function VehicleSearch({
  supabase,
  shopId,
  customerId,
  value,
  onPick,
}: {
  supabase: ReturnType<typeof createClientComponentClient<DB>>;
  shopId: string | null;
  customerId: string | null;
  value: string;
  onPick: (v: VehiclePick) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<VehiclePick[]>([]);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const reqCounter = useRef(0);

  useEffect(() => {
    const term = value.trim();
    if (!shopId || !customerId || term.length < 1) {
      setRows([]);
      setOpen(false);
      return;
    }

    setOpen(true);
    const thisReq = ++reqCounter.current;

    const t = window.setTimeout(async () => {
      setBusy(true);
      try {
        const like = `%${term}%`;
        const { data, error } = await supabase
          .from("vehicles")
          .select(
            "id,unit_number,license_plate,vin,year,make,model,mileage,color,created_at",
          )
          .eq("shop_id", shopId)
          .eq("customer_id", customerId)
          .or(
            [
              `unit_number.ilike.${like}`,
              `license_plate.ilike.${like}`,
              `vin.ilike.${like}`,
              `make.ilike.${like}`,
              `model.ilike.${like}`,
            ].join(","),
          )
          .order("created_at", { ascending: false })
          .limit(12);

        if (error) throw error;
        if (thisReq === reqCounter.current) {
          setRows((data ?? []) as VehiclePick[]);
        }
      } catch {
        if (thisReq === reqCounter.current) setRows([]);
      } finally {
        if (thisReq === reqCounter.current) setBusy(false);
      }
    }, 150);

    return () => window.clearTimeout(t);
  }, [value, shopId, customerId, supabase]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  if (!open && !busy) return null;

  return (
    <div ref={wrapRef} className="relative">
      <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-white/15 bg-black/80 backdrop-blur-xl shadow-lg shadow-black/70">
        {busy && (
          <div className="px-3 py-2 text-xs text-neutral-300">Searching…</div>
        )}
        {rows.map((v) => (
          <button
            key={v.id}
            type="button"
            className="block w-full px-3 py-2 text-left text-sm transition hover:bg-[var(--accent-copper)]/15 hover:text-neutral-50"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onPick(v);
              setOpen(false);
            }}
          >
            <div className="truncate text-neutral-100">{formatVehicleTitle(v)}</div>
            <div className="truncate text-xs text-neutral-400">{formatVehicleSub(v) || "—"}</div>
          </button>
        ))}
        {!busy && rows.length === 0 && (
          <div className="px-3 py-2 text-xs text-neutral-400">No matches</div>
        )}
      </div>
    </div>
  );
}

export default function MobileCreateWorkOrderPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const draft = useWorkOrderDraft();

  const [wo, setWo] = useState<WorkOrderRow | null>(null);
  const [lines, setLines] = useState<WorkOrderLineRow[]>([]);

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

  const [shopId, setShopId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [creatingWo, setCreatingWo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // waiter flag (customer waiting on-site)
  const [isWaiter, setIsWaiter] = useState(false);

  // lightweight search inputs (keep UI small)
  const [customerSearch, setCustomerSearch] = useState("");
  const [vehicleSearch, setVehicleSearch] = useState("");

  /* ------------------------------------------------------------------------ */
  /* Resolve current user + shop id                                           */
  /* ------------------------------------------------------------------------ */
  useEffect(() => {
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const uid = user?.id ?? null;
      setCurrentUserId(uid);

      if (uid) {
        try {
          const sid = await getOrLinkShopId(supabase, uid);
          setShopId(sid);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Failed to load shop.");
        }
      }
    })();
  }, [supabase]);

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
          draftVehicle.license_plate ?? draftVehicle.plate ?? prev.license_plate,
      }));
    }

    if (hasVeh || hasCust) {
      draft.reset();
    }
  }, [draft]);

  /* ------------------------------------------------------------------------ */
  /* Lines                                                                    */
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
        () => void fetchLines(),
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
  /* Waiter toggle → persist to work_orders (once WO exists)                  */
  /* ------------------------------------------------------------------------ */
  const handleWaiterChange = useCallback(
    async (value: boolean) => {
      setIsWaiter(value);
      if (!wo?.id) return;
      try {
        await supabase
          .from("work_orders")
          .update({ is_waiter: value } as Partial<WorkOrderRow>)
          .eq("id", wo.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to update visit type.");
      }
    },
    [wo?.id, supabase],
  );

  /* ------------------------------------------------------------------------ */
  /* Ensure customer + vehicle (minimal, aligned behavior)                    */
  /* ------------------------------------------------------------------------ */
  const ensureCustomer = useCallback(
    async (): Promise<CustomerRow> => {
      if (!shopId) throw new Error("Missing shop.");

      // If selected existing customer id → fetch it (and optionally update)
      if (customer.id) {
        const { data: existing, error: exErr } = await supabase
          .from("customers")
          .select("*")
          .eq("id", customer.id)
          .eq("shop_id", shopId)
          .maybeSingle();
        if (exErr) throw exErr;
        if (!existing) throw new Error("Selected customer not found.");
        return existing;
      }

      // Try match by phone or email (within shop)
      const phone = strOrNull(customer.phone);
      const email = strOrNull(customer.email);

      if (phone || email) {
        let q = supabase.from("customers").select("*").eq("shop_id", shopId).limit(1);
        if (phone) q = q.ilike("phone", phone);
        else if (email) q = q.ilike("email", email);

        const { data: found, error: fErr } = await q;
        if (fErr) throw fErr;
        if (found?.length) {
          setCustomer((prev) => ({ ...prev, id: found[0].id }));
          return found[0] as CustomerRow;
        }
      }

      // Insert new
      const { data: inserted, error: insErr } = await supabase
        .from("customers")
        .insert({
          shop_id: shopId,
          first_name: strOrNull(customer.first_name),
          last_name: strOrNull(customer.last_name),
          phone: phone,
          email: email,
        })
        .select("*")
        .single();

      if (insErr || !inserted) {
        throw new Error(insErr?.message ?? "Failed to create customer.");
      }

      setCustomer((prev) => ({ ...prev, id: inserted.id }));
      return inserted as CustomerRow;
    },
    [customer, shopId, supabase],
  );

  const ensureVehicle = useCallback(
    async (cust: CustomerRow): Promise<VehicleRow> => {
      if (!shopId) throw new Error("Missing shop.");

      if (vehicle.id) {
        const { data: existing, error: exErr } = await supabase
          .from("vehicles")
          .select("*")
          .eq("id", vehicle.id)
          .eq("shop_id", shopId)
          .maybeSingle();
        if (exErr) throw exErr;
        if (!existing) throw new Error("Selected vehicle not found.");
        return existing;
      }

      // Try match by vin or plate for this customer
      const vin = strOrNull(vehicle.vin);
      const plate = strOrNull(vehicle.license_plate);

      const orParts = [
        vin ? `vin.eq.${vin}` : "",
        plate ? `license_plate.eq.${plate}` : "",
      ].filter(Boolean);

      if (orParts.length) {
        const { data: maybe, error: mErr } = await supabase
          .from("vehicles")
          .select("*")
          .eq("shop_id", shopId)
          .eq("customer_id", cust.id)
          .or(orParts.join(","))
          .limit(1);

        if (mErr) throw mErr;
        if (maybe?.length) {
          setVehicle((prev) => ({ ...prev, id: maybe[0].id }));
          return maybe[0] as VehicleRow;
        }
      }

      // Insert new
      const { data: inserted, error: insErr } = await supabase
        .from("vehicles")
        .insert({
          shop_id: shopId,
          customer_id: cust.id,
          vin: vin,
          license_plate: plate,
          year: vehicle.year ? Number(vehicle.year) : null,
          make: strOrNull(vehicle.make),
          model: strOrNull(vehicle.model),
          mileage: numStringOrNull(vehicle.mileage),
          color: strOrNull(vehicle.color),
        })
        .select("*")
        .single();

      if (insErr || !inserted) {
        throw new Error(insErr?.message ?? "Failed to create vehicle.");
      }

      setVehicle((prev) => ({ ...prev, id: inserted.id }));
      return inserted as VehicleRow;
    },
    [vehicle, shopId, supabase],
  );

  /* ------------------------------------------------------------------------ */
  /* Create Work Order (RPC)                                                  */
  /* ------------------------------------------------------------------------ */
  const handleCreateWorkOrder = useCallback(async () => {
    if (creatingWo) return;
    setCreatingWo(true);
    setError(null);

    try {
      if (!currentUserId) throw new Error("Not signed in.");
      if (!shopId) throw new Error("Your profile isn’t linked to a shop yet.");

      // Require at least something for customer
      if (!customer.first_name && !customer.last_name && !customer.phone && !customer.email) {
        throw new Error("Enter at least a name, phone, or email.");
      }

      const cust = await ensureCustomer();
      const veh = await ensureVehicle(cust);

      // Create WO via DB retry function (custom_id generated inside)
      const { data: created, error: rpcErr } = await supabase.rpc(
        "create_work_order_with_custom_id",
        {
          p_shop_id: shopId,
          p_customer_id: cust.id,
          p_vehicle_id: veh.id,
          p_notes: "" ,
          p_priority: 3,
          p_is_waiter: isWaiter,
        },
      );

      if (rpcErr) throw rpcErr;
      if (!created) throw new Error("Failed to create work order.");

      // `rpc` returns a row-ish object. Cast safely to WorkOrderRow.
      const createdWo = created as unknown as WorkOrderRow;

      setWo(createdWo);
      setIsWaiter(Boolean((createdWo as unknown as { is_waiter?: boolean | null }).is_waiter));
      await fetchLines();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create work order.");
    } finally {
      setCreatingWo(false);
    }
  }, [
    creatingWo,
    currentUserId,
    shopId,
    customer,
    ensureCustomer,
    ensureVehicle,
    isWaiter,
    supabase,
    fetchLines,
  ]);

  /* ------------------------------------------------------------------------ */
  /* Continue → mobile WO detail                                              */
  /* ------------------------------------------------------------------------ */
  const handleContinue = async () => {
    if (!wo?.id) return;
    setLoading(true);
    setError(null);
    try {
      router.push(`/mobile/work-orders/${wo.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to continue.");
    } finally {
      setLoading(false);
    }
  };

  /* ------------------------------------------------------------------------ */
  /* UI                                                                       */
  /* ------------------------------------------------------------------------ */
  const woCustomId = wo?.custom_id ?? null;

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
                Pick a customer + vehicle, then create the ticket.
              </p>
            </div>
            {woCustomId && (
              <div className="rounded-full border border-white/15 bg-black/40 px-3 py-1 text-[0.7rem] font-mono text-neutral-100">
                WO&nbsp;
                <span className="text-[var(--accent-copper-soft)]">
                  {woCustomId}
                </span>
              </div>
            )}
          </div>

          {/* Visit type / waiter toggle */}
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-[0.68rem] font-medium uppercase tracking-[0.16em] text-neutral-400">
              Visit type
            </span>
            <div className="inline-flex overflow-hidden rounded-full border border-white/15 bg-black/60 text-[0.7rem]">
              <button
                type="button"
                onClick={() => void handleWaiterChange(false)}
                className={`px-3 py-1.5 font-medium transition ${
                  !isWaiter ? "bg-white/10 text-neutral-50" : "text-neutral-400"
                }`}
              >
                Drop-off
              </button>
              <button
                type="button"
                onClick={() => void handleWaiterChange(true)}
                className={`px-3 py-1.5 font-medium transition border-l border-white/10 ${
                  isWaiter
                    ? "bg-[var(--accent-copper)]/20 text-[var(--accent-copper-light)]"
                    : "text-neutral-400"
                }`}
              >
                Waiter
              </button>
            </div>
          </div>

          {error && (
            <p className="mt-3 rounded-lg border border-red-500/50 bg-red-950/70 px-3 py-2 text-[0.7rem] text-red-100">
              {error}
            </p>
          )}

          {!shopId && currentUserId && (
            <p className="mt-3 rounded-lg border border-yellow-500/40 bg-yellow-950/30 px-3 py-2 text-[0.7rem] text-yellow-100">
              Your profile isn’t linked to a shop yet.
            </p>
          )}
        </section>

        {/* Customer + Vehicle (stripped but DB-backed) */}
        <div className="glass-card rounded-2xl border border-white/10 px-3 py-3 text-white">
          {/* Customer */}
          <div className="space-y-2">
            <div className="text-[0.68rem] font-medium uppercase tracking-[0.16em] text-neutral-400">
              Customer
            </div>

            <div className="space-y-1">
              <input
                className="input"
                placeholder="Search customers… (name, phone, email)"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
              />
              <CustomerSearch
                supabase={supabase}
                shopId={shopId}
                value={customerSearch}
                onPick={(c) => {
                  setCustomer({
                    id: c.id,
                    first_name: c.first_name ?? null,
                    last_name: c.last_name ?? null,
                    phone: c.phone ?? null,
                    email: c.email ?? null,
                  });
                  // reset vehicle on customer change
                  setVehicle((prev) => ({ ...prev, id: null }));
                  setVehicleSearch("");
                }}
              />
            </div>

            {/* Manual entry (still allowed) */}
            <div className="grid grid-cols-2 gap-2">
              <input
                className="input"
                placeholder="First name"
                value={customer.first_name ?? ""}
                onChange={(e) =>
                  setCustomer((p) => ({ ...p, first_name: e.target.value || null, id: p.id }))
                }
              />
              <input
                className="input"
                placeholder="Last name"
                value={customer.last_name ?? ""}
                onChange={(e) =>
                  setCustomer((p) => ({ ...p, last_name: e.target.value || null, id: p.id }))
                }
              />
              <input
                className="input col-span-2"
                placeholder="Phone"
                value={customer.phone ?? ""}
                onChange={(e) =>
                  setCustomer((p) => ({ ...p, phone: e.target.value || null, id: p.id }))
                }
              />
              <input
                className="input col-span-2"
                placeholder="Email"
                value={customer.email ?? ""}
                onChange={(e) =>
                  setCustomer((p) => ({ ...p, email: e.target.value || null, id: p.id }))
                }
              />
            </div>
          </div>

          <div className="my-4 h-px bg-white/10" />

          {/* Vehicle */}
          <div className="space-y-2">
            <div className="text-[0.68rem] font-medium uppercase tracking-[0.16em] text-neutral-400">
              Vehicle
            </div>

            <div className="space-y-1">
              <input
                className="input"
                placeholder="Search vehicles… (unit, plate, VIN, model)"
                value={vehicleSearch}
                onChange={(e) => setVehicleSearch(e.target.value)}
                disabled={!customer.id}
              />
              <VehicleSearch
                supabase={supabase}
                shopId={shopId}
                customerId={customer.id}
                value={vehicleSearch}
                onPick={(v) => {
                  setVehicle({
                    id: v.id,
                    vin: v.vin ?? null,
                    year: v.year != null ? String(v.year) : null,
                    make: v.make ?? null,
                    model: v.model ?? null,
                    license_plate: v.license_plate ?? null,
                    mileage: v.mileage ?? null,
                    color: v.color ?? null,
                  });
                }}
              />
              {!customer.id && (
                <p className="text-[0.7rem] text-neutral-500">
                  Select a customer first to search their vehicles.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <input
                className="input"
                placeholder="Year"
                inputMode="numeric"
                value={vehicle.year ?? ""}
                onChange={(e) =>
                  setVehicle((p) => ({ ...p, year: e.target.value || null, id: p.id }))
                }
              />
              <input
                className="input"
                placeholder="Plate"
                value={vehicle.license_plate ?? ""}
                onChange={(e) =>
                  setVehicle((p) => ({ ...p, license_plate: e.target.value || null, id: p.id }))
                }
              />
              <input
                className="input"
                placeholder="Make"
                value={vehicle.make ?? ""}
                onChange={(e) =>
                  setVehicle((p) => ({ ...p, make: e.target.value || null, id: p.id }))
                }
              />
              <input
                className="input"
                placeholder="Model"
                value={vehicle.model ?? ""}
                onChange={(e) =>
                  setVehicle((p) => ({ ...p, model: e.target.value || null, id: p.id }))
                }
              />
              <input
                className="input col-span-2"
                placeholder="VIN"
                value={vehicle.vin ?? ""}
                onChange={(e) =>
                  setVehicle((p) => ({ ...p, vin: e.target.value || null, id: p.id }))
                }
              />
            </div>

            {/* VIN scan */}
            <div className="mt-2 flex flex-wrap gap-2">
              <VinCaptureModal
                userId={currentUserId ?? "anon"}
                action="/api/vin"
                onDecoded={(decoded) => {
                  // store in shared draft (used by desktop + other flows)
                  const v: DraftVehicleShape = {
                    vin: decoded.vin ?? null,
                    year: decoded.year ?? null,
                    make: decoded.make ?? null,
                    model: decoded.model ?? null,
                    engine: (decoded as unknown as { engine?: string | null }).engine ?? null,
                    fuel_type: (decoded as unknown as { fuelType?: string | null }).fuelType ?? null,
                    drivetrain: (decoded as unknown as { driveType?: string | null }).driveType ?? null,
                    transmission: (decoded as unknown as { transmission?: string | null }).transmission ?? null,
                  };
                  draft.setVehicle(v);

                  // patch local state
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

          {/* Create WO button */}
          {!wo?.id ? (
            <button
              type="button"
              disabled={!shopId || creatingWo}
              onClick={() => void handleCreateWorkOrder()}
              className="mt-4 w-full rounded-full bg-[var(--accent-copper)] py-3 text-sm font-semibold text-black shadow-[0_0_25px_rgba(0,0,0,0.9)] transition active:opacity-85 disabled:opacity-60"
            >
              {creatingWo ? "Creating…" : "Create Work Order"}
            </button>
          ) : (
            <p className="mt-4 text-center text-[0.7rem] text-neutral-400">
              Work order created — add lines below, then continue.
            </p>
          )}
        </div>

        {/* Lines (only once WO exists) */}
        {wo?.id && (
          <>
            <MobileWorkOrderLines
              lines={lines}
              workOrderId={wo.id}
              onDelete={async (lineId) => {
                await supabase
                  .from("work_order_lines")
                  .delete()
                  .eq("id", lineId)
                  .eq("work_order_id", wo.id);
                await fetchLines();
              }}
            />

            <div className="glass-card rounded-2xl border border-white/10 px-3 py-3">
              <MobileJobLineAdd
                workOrderId={wo.id}
                vehicleId={vehicle.id}
                defaultJobType="diagnosis"
                onCreated={fetchLines}
              />
            </div>

            <button
              disabled={loading}
              onClick={() => void handleContinue()}
              className="w-full rounded-full bg-[var(--accent-copper)] py-3 text-sm font-semibold text-black shadow-[0_0_25px_rgba(0,0,0,0.9)] transition active:opacity-85 disabled:opacity-60"
            >
              {loading ? "Saving…" : "Approve & Continue"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}