"use client";

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import {
  SessionCustomer as CustomerInfo,
  SessionVehicle as VehicleInfo,
} from "@inspections/lib/inspection/types";

type DB = Database;

/** Local, narrow shapes (same as desktop) */
type CustomerRow = {
  id: string;
  business_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
};

type VehicleRow = {
  id: string;
  vin?: string | null;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  license_plate?: string | null;
  mileage?: string | null;
  unit_number?: string | null;
  color?: string | null;
  engine_hours?: number | null;
  customer_id?: string | null;
  created_at?: string | null;
};

/** Mobile props – whole-object setters for customer/vehicle */
interface MobileCustomerVehicleFormProps {
  wo: { id?: string; shop_id?: string | null } | null;
  customer: CustomerInfo;
  vehicle: VehicleInfo;
  onCustomerChange: (next: CustomerInfo) => void;
  onVehicleChange: (next: VehicleInfo) => void;
  /** Optional: reuse an existing client; falls back to its own */
  supabase?: SupabaseClient<DB>;
}

/* Small helper to split a single "name" into first/last */
function splitNamefallback(
  n?: string | null
): { first: string | null; last: string | null } {
  const s = (n ?? "").trim();
  if (!s) return { first: null, last: null };
  const parts = s.split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: null };
  return { first: parts[0], last: parts.slice(1).join(" ") || null };
}

/* -------------------------------------------------------------------------- */
/* Autocomplete: Customer (business + first/last, STRICT same-shop)           */
/* -------------------------------------------------------------------------- */

function CustomerAutocomplete({
  q,
  shopId,
  onPick,
}: {
  q: string;
  shopId: string | null;
  onPick: (c: CustomerRow) => void;
}) {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const reqCounter = useRef(0);

  useEffect(() => {
    const term = (q ?? "").trim();

    // require 2+ chars and a shop
    if (!term || !shopId || term.length < 2) {
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
          .select(
            "id, business_name, first_name, last_name, phone, email, name, created_at"
          )
          .eq("shop_id", shopId)
          .or(
            `business_name.ilike.${like},first_name.ilike.${like},last_name.ilike.${like}`
          )
          .order("created_at", { ascending: false })
          .limit(12);

        if (error) throw error;
        if (thisReq === reqCounter.current)
          setRows((data ?? []) as CustomerRow[]);
      } catch {
        if (thisReq === reqCounter.current) setRows([]);
      } finally {
        if (thisReq === reqCounter.current) setBusy(false);
      }
    }, 150);

    return () => window.clearTimeout(t);
  }, [q, shopId, supabase]);

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
      {(open || busy) && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-neutral-700 bg-neutral-900 shadow-lg">
          {busy && (
            <div className="px-3 py-2 text-xs text-neutral-400">
              Searching…
            </div>
          )}
          {rows.map((c) => {
            const contact = [c.first_name, c.last_name]
              .filter(Boolean)
              .join(" ");
            const top = c.business_name || contact || "Unnamed";
            const sub =
              c.business_name && contact
                ? contact
                : [c.phone, c.email].filter(Boolean).join(" · ");
            return (
              <button
                key={c.id}
                type="button"
                className="block w-full cursor-pointer px-3 py-2 text-left text-sm hover:bg-neutral-800"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onPick(c);
                  setOpen(false);
                }}
              >
                <div className="truncate text-neutral-100">{top}</div>
                <div className="truncate text-xs text-neutral-400">
                  {sub || "—"}
                </div>
              </button>
            );
          })}
          {!busy && rows.length === 0 && (
            <div className="px-3 py-2 text-xs text-neutral-400">
              No matches
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Autocomplete: Unit # (vehicles of selected customer within same shop)      */
/* -------------------------------------------------------------------------- */

function UnitNumberAutocomplete({
  q,
  shopId,
  customerId,
  onPick,
}: {
  q: string;
  shopId: string | null;
  customerId: string | null;
  onPick: (v: VehicleRow) => void;
}) {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [rows, setRows] = useState<VehicleRow[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const reqCounter = useRef(0);

  useEffect(() => {
    const term = (q ?? "").trim();

    if (!term || !shopId || !customerId) {
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
            "id, unit_number, license_plate, vin, year, make, model, mileage, color, engine_hours, created_at"
          )
          .eq("shop_id", shopId)
          .eq("customer_id", customerId)
          .or(
            `unit_number.ilike.${like},license_plate.ilike.${like},vin.ilike.${like},model.ilike.${like}`
          )
          .order("created_at", { ascending: false })
          .limit(12);

        if (error) throw error;
        if (thisReq === reqCounter.current)
          setRows((data ?? []) as VehicleRow[]);
      } catch {
        if (thisReq === reqCounter.current) setRows([]);
      } finally {
        if (thisReq === reqCounter.current) setBusy(false);
      }
    }, 150);

    return () => window.clearTimeout(t);
  }, [q, shopId, customerId, supabase]);

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
      {(open || busy) && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-neutral-700 bg-neutral-900 shadow-lg">
          {busy && (
            <div className="px-3 py-2 text-xs text-neutral-400">
              Searching…
            </div>
          )}
          {rows.map((v) => {
            const title =
              v.unit_number ||
              v.license_plate ||
              v.vin?.slice(-8) ||
              [v.year, v.make, v.model].filter(Boolean).join(" ") ||
              "Vehicle";
            const sub = [
              v.license_plate,
              v.vin?.slice(-8),
              [v.year, v.make, v.model].filter(Boolean).join(" "),
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <button
                key={v.id}
                type="button"
                className="block w-full cursor-pointer px-3 py-2 text-left text-sm hover:bg-neutral-800"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onPick(v);
                  setOpen(false);
                }}
              >
                <div className="truncate text-neutral-100">{title}</div>
                <div className="truncate text-xs text-neutral-400">
                  {sub || "—"}
                </div>
              </button>
            );
          })}
          {!busy && rows.length === 0 && (
            <div className="px-3 py-2 text-xs text-neutral-400">
              No matches
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ========================================================================== */
/*                          Mobile Customer/Vehicle Form                      */
/* ========================================================================== */

export function MobileCustomerVehicleForm({
  wo,
  customer,
  vehicle,
  onCustomerChange,
  onVehicleChange,
  supabase: supabaseProp,
}: MobileCustomerVehicleFormProps) {
  const client = useMemo(
    () => supabaseProp ?? createClientComponentClient<DB>(),
    [supabaseProp]
  );

  const [shopId, setShopId] = useState<string | null>(
    (wo?.shop_id as string | null) ?? null
  );
  const [currentCustomerId, setCurrentCustomerId] = useState<string | null>(
    null
  );

  const workOrderExists = !!wo?.id;

  // derive shop id from profile if not on WO
  useEffect(() => {
    if (shopId) return;
    (async () => {
      const { data: auth } = await client.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return;
      const { data } = await client
        .from("profiles")
        .select("shop_id")
        .eq("id", uid)
        .maybeSingle();
      if (data?.shop_id) setShopId(data.shop_id);
    })();
  }, [client, shopId]);

  // field helpers: adapt desktop field-style to whole-object setters
  const setCustomerField = useCallback(
    (field: keyof CustomerInfo | "business_name" | "address" | "city" | "province" | "postal_code") =>
      (value: string | null) => {
        onCustomerChange({
          ...(customer as any),
          [field]: value,
        });
      },
    [customer, onCustomerChange]
  );

  const setVehicleField = useCallback(
    (
        field:
          | keyof VehicleInfo
          | "unit_number"
          | "vin"
          | "year"
          | "make"
          | "model"
          | "license_plate"
          | "mileage"
          | "color"
          | "engine_hours"
      ) =>
      (value: string | null) => {
        onVehicleChange({
          ...(vehicle as any),
          [field]: value,
        });
      },
    [vehicle, onVehicleChange]
  );

  async function handlePickedCustomer(c: CustomerRow) {
    const fallback = splitNamefallback(c.name);

    // fill basic fields immediately
    setCustomerField("business_name")(c.business_name ?? null);
    setCustomerField("first_name")(
      (c.first_name ?? fallback.first) ?? null
    );
    setCustomerField("last_name")(
      (c.last_name ?? fallback.last) ?? null
    );
    setCustomerField("phone")(c.phone ?? null);
    setCustomerField("email")(c.email ?? null);

    // load the rest
    try {
      const { data } = await client
        .from("customers")
        .select("*")
        .eq("id", c.id)
        .maybeSingle();
      if (data) {
        const d = data as CustomerRow;
        const fb = splitNamefallback(d.name);
        setCustomerField("business_name")(d.business_name ?? null);
        setCustomerField("first_name")(
          (d.first_name ?? fb.first) ?? null
        );
        setCustomerField("last_name")(
          (d.last_name ?? fb.last) ?? null
        );
        setCustomerField("address")(d.address ?? null);
        setCustomerField("city")(d.city ?? null);
        setCustomerField("province")(d.province ?? null);
        setCustomerField("postal_code")(d.postal_code ?? null);
      }
    } catch {
      // ignore
    }

    setCurrentCustomerId(c.id);

    // auto-fill single vehicle, same as desktop
    try {
      const { data: vehs } = await client
        .from("vehicles")
        .select(
          "id, vin, year, make, model, license_plate, mileage, unit_number, color, engine_hours, created_at"
        )
        .eq("customer_id", c.id)
        .eq("shop_id", shopId)
        .order("created_at", { ascending: false })
        .limit(2);

      const arr = (vehs ?? []) as VehicleRow[];
      if (arr.length === 1) {
        const v = arr[0];
        setVehicleField("vin")((v.vin ?? "") || null);
        setVehicleField("year")(
          v.year != null ? String(v.year) : null
        );
        setVehicleField("make")(v.make ?? null);
        setVehicleField("model")(v.model ?? null);
        setVehicleField("license_plate")(v.license_plate ?? null);
        setVehicleField("mileage")((v.mileage ?? "") || null);
        setVehicleField("unit_number")(v.unit_number ?? null);
        setVehicleField("color")(v.color ?? null);
        setVehicleField("engine_hours")(
          v.engine_hours != null ? String(v.engine_hours) : null
        );
      }
    } catch {
      // ignore
    }
  }

  return (
    <div className="w-full space-y-6 rounded-2xl border border-neutral-800 bg-black/60 p-4 text-white">
      {/* Heading */}
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-blackops text-orange-400 uppercase tracking-[0.15em]">
          Customer & Vehicle
        </h2>
        <p className="text-[11px] text-neutral-400">
          Search existing customers and units, or enter new details.
        </p>
        {workOrderExists && (
          <span className="mt-1 w-fit rounded-full border border-emerald-500/60 bg-emerald-500/10 px-3 py-1 text-[10px] text-emerald-200">
            Linked to existing work order
          </span>
        )}
      </div>

      {/* Customer card */}
      <div className="space-y-4 rounded-xl border border-neutral-800 bg-neutral-950 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-neutral-100">
            Customer Info
          </h3>
          <span className="text-[10px] text-neutral-500">
            Start typing to search this shop.
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {/* Business name + autocomplete */}
          <div className="space-y-1">
            <label className="text-xs text-neutral-300">
              Business name{" "}
              <span className="text-neutral-500">(optional)</span>
            </label>
            <input
              className="input"
              placeholder="Business name"
              value={(customer as any).business_name ?? ""}
              onChange={(e) =>
                setCustomerField("business_name")(
                  e.target.value || null
                )
              }
            />
            <CustomerAutocomplete
              q={(customer as any).business_name ?? ""}
              shopId={shopId}
              onPick={handlePickedCustomer}
            />
          </div>

          {/* First / Last */}
          <div className="space-y-1">
            <label className="text-xs text-neutral-300">First name</label>
            <input
              className="input"
              placeholder="First name"
              value={customer.first_name ?? ""}
              onChange={(e) =>
                setCustomerField("first_name")(e.target.value || null)
              }
            />
            <CustomerAutocomplete
              q={customer.first_name ?? ""}
              shopId={shopId}
              onPick={handlePickedCustomer}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-neutral-300">Last name</label>
            <input
              className="input"
              placeholder="Last name"
              value={customer.last_name ?? ""}
              onChange={(e) =>
                setCustomerField("last_name")(e.target.value || null)
              }
            />
            <CustomerAutocomplete
              q={customer.last_name ?? ""}
              shopId={shopId}
              onPick={handlePickedCustomer}
            />
          </div>

          {/* Phone / Email */}
          <div className="space-y-1">
            <label className="text-xs text-neutral-300">Phone</label>
            <input
              className="input"
              placeholder="Phone"
              value={customer.phone ?? ""}
              onChange={(e) =>
                setCustomerField("phone")(e.target.value || null)
              }
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-neutral-300">Email</label>
            <input
              type="email"
              className="input"
              placeholder="Email"
              value={customer.email ?? ""}
              onChange={(e) =>
                setCustomerField("email")(e.target.value || null)
              }
            />
          </div>

          {/* Address */}
          <div className="space-y-1">
            <label className="text-xs text-neutral-300">Address</label>
            <input
              className="input"
              placeholder="Street address"
              value={(customer as any).address ?? ""}
              onChange={(e) =>
                setCustomerField("address")(e.target.value || null)
              }
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <label className="text-xs text-neutral-300">City</label>
              <input
                className="input"
                placeholder="City"
                value={(customer as any).city ?? ""}
                onChange={(e) =>
                  setCustomerField("city")(e.target.value || null)
                }
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-neutral-300">Province</label>
              <input
                className="input"
                placeholder="Province"
                value={(customer as any).province ?? ""}
                onChange={(e) =>
                  setCustomerField("province")(e.target.value || null)
                }
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-neutral-300">
                Postal code
              </label>
              <input
                className="input"
                placeholder="Postal code"
                value={(customer as any).postal_code ?? ""}
                onChange={(e) =>
                  setCustomerField("postal_code")(
                    e.target.value || null
                  )
                }
              />
            </div>
          </div>
        </div>
      </div>

      {/* Vehicle card */}
      <div className="space-y-4 rounded-xl border border-neutral-800 bg-neutral-950 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-neutral-100">
            Vehicle Info
          </h3>
          <span className="text-[10px] text-neutral-500">
            Unit # / plate pulls existing vehicles.
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {/* Unit # */}
          <div className="space-y-1">
            <label className="text-xs text-neutral-300">Unit #</label>
            <input
              className="input"
              placeholder="Unit #"
              value={(vehicle as any).unit_number ?? ""}
              onChange={(e) =>
                setVehicleField("unit_number")(e.target.value || null)
              }
            />
            <UnitNumberAutocomplete
              q={(vehicle as any).unit_number ?? ""}
              shopId={shopId}
              customerId={currentCustomerId}
              onPick={(v) => {
                setVehicleField("unit_number")(v.unit_number ?? null);
                setVehicleField("vin")((v.vin ?? "") || null);
                setVehicleField("year")(
                  v.year != null ? String(v.year) : null
                );
                setVehicleField("make")(v.make ?? null);
                setVehicleField("model")(v.model ?? null);
                setVehicleField("license_plate")(
                  v.license_plate ?? null
                );
                setVehicleField("mileage")(
                  (v.mileage ?? "") || null
                );
                setVehicleField("color")(v.color ?? null);
                setVehicleField("engine_hours")(
                  v.engine_hours != null ? String(v.engine_hours) : null
                );
              }}
            />
          </div>

          {/* Year / Make / Model */}
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <label className="text-xs text-neutral-300">Year</label>
              <input
                inputMode="numeric"
                className="input"
                placeholder="Year"
                value={(vehicle as any).year ?? ""}
                onChange={(e) =>
                  setVehicleField("year")(e.target.value || null)
                }
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-neutral-300">Make</label>
              <input
                className="input"
                placeholder="Make"
                value={vehicle.make ?? ""}
                onChange={(e) =>
                  setVehicleField("make")(e.target.value || null)
                }
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-neutral-300">Model</label>
              <input
                className="input"
                placeholder="Model"
                value={vehicle.model ?? ""}
                onChange={(e) =>
                  setVehicleField("model")(e.target.value || null)
                }
              />
            </div>
          </div>

          {/* VIN / Plate */}
          <div className="space-y-1">
            <label className="text-xs text-neutral-300">VIN</label>
            <input
              className="input"
              placeholder="VIN"
              value={vehicle.vin ?? ""}
              onChange={(e) =>
                setVehicleField("vin")(e.target.value || null)
              }
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-neutral-300">
              License plate
            </label>
            <input
              className="input"
              placeholder="License plate"
              value={vehicle.license_plate ?? ""}
              onChange={(e) =>
                setVehicleField("license_plate")(
                  e.target.value || null
                )
              }
            />
          </div>

          {/* Mileage / Color / Engine hours */}
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <label className="text-xs text-neutral-300">Mileage</label>
              <input
                inputMode="numeric"
                className="input"
                placeholder="Mileage"
                value={(vehicle as any).mileage ?? ""}
                onChange={(e) =>
                  setVehicleField("mileage")(e.target.value || null)
                }
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-neutral-300">Color</label>
              <input
                className="input"
                placeholder="Color"
                value={(vehicle as any).color ?? ""}
                onChange={(e) =>
                  setVehicleField("color")(e.target.value || null)
                }
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-neutral-300">
                Engine hours
              </label>
              <input
                inputMode="numeric"
                className="input"
                placeholder="Engine hours"
                value={(vehicle as any).engine_hours ?? ""}
                onChange={(e) =>
                  setVehicleField("engine_hours")(
                    e.target.value || null
                  )
                }
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MobileCustomerVehicleForm;