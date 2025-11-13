"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import {
  SessionCustomer as CustomerInfo,
  SessionVehicle as VehicleInfo,
} from "@inspections/lib/inspection/types";

/** Local, narrow shapes (avoid exporting DB row types in props) */
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

/** ✅ Public props are serializable */
interface Props {
  customer: CustomerInfo;
  vehicle: VehicleInfo;

  /** Optional UI bits */
  saving?: boolean;
  workOrderExists?: boolean;

  /** 🔒 REQUIRED: scope search to this shop only */
  shopId: string | null;

  /** One object for callbacks; typed as unknown to keep props serializable */
  handlers?: unknown;
}

/** Internal view of handlers (kept private to this file) */
type Handlers = {
  onCustomerChange?: (
    field: keyof CustomerInfo | "business_name",
    value: string | null
  ) => void;
  onVehicleChange?: (field: keyof VehicleInfo, value: string | null) => void;
  onSave?: () => void;
  onClear?: () => void;
  onCustomerSelected?: (customerId: string) => void;
  onVehicleSelected?: (vehicleId: string) => void;
};

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
  const supabase = useMemo(() => createClientComponentClient<Database>(), []);
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
            "id, business_name, first_name, last_name, phone, email, created_at"
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
  const supabase = useMemo(() => createClientComponentClient<Database>(), []);
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
/*                                Form Component                              */
/* ========================================================================== */

export default function CustomerVehicleForm({
  customer,
  vehicle,
  saving = false,
  workOrderExists = false,
  shopId, // 🔒 REQUIRED
  handlers,
}: Props) {
  const supabase = useMemo(() => createClientComponentClient<Database>(), []);

  // Safely unwrap handlers (no-ops by default)
  const {
    onCustomerChange = () => {},
    onVehicleChange = () => {},
    onSave,
    onClear,
    onCustomerSelected,
    onVehicleSelected,
  } = (handlers as Handlers) ?? {};

  const [currentCustomerId, setCurrentCustomerId] = useState<string | null>(
    null
  );

  async function handlePickedCustomer(c: CustomerRow) {
    const fallback = splitNamefallback(c.name);

    // Fill immediate customer fields (fallback to "name" when needed)
    (onCustomerChange as any)("business_name", c.business_name ?? null);
    onCustomerChange(
      "first_name",
      (c.first_name ?? fallback.first) ?? null
    );
    onCustomerChange("last_name", (c.last_name ?? fallback.last) ?? null);
    onCustomerChange("phone", c.phone ?? null);
    onCustomerChange("email", c.email ?? null);

    // Fill remaining fields (also ensure business_name)
    try {
      const { data } = await supabase
        .from("customers")
        .select("*")
        .eq("id", c.id)
        .maybeSingle();
      if (data) {
        const d = data as CustomerRow;
        const fb = splitNamefallback(d.name);
        (onCustomerChange as any)("business_name", d.business_name ?? null);
        onCustomerChange(
          "first_name",
          (d.first_name ?? fb.first) ?? null
        );
        onCustomerChange("last_name", (d.last_name ?? fb.last) ?? null);
        onCustomerChange("address", d.address ?? null);
        onCustomerChange("city", d.city ?? null);
        onCustomerChange("province", d.province ?? null);
        onCustomerChange("postal_code", d.postal_code ?? null);
      }
    } catch {
      /* ignore */
    }

    // let parent capture id, and keep locally for Unit# selector
    onCustomerSelected?.(c.id);
    setCurrentCustomerId(c.id);

    // If they only have one vehicle, auto-fill it
    try {
      const { data: vehs } = await supabase
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
        onVehicleChange("vin", (v.vin ?? "") || null);
        onVehicleChange(
          "year",
          v.year != null ? String(v.year) : null
        );
        onVehicleChange("make", v.make ?? null);
        onVehicleChange("model", v.model ?? null);
        onVehicleChange("license_plate", v.license_plate ?? null);
        onVehicleChange("mileage", (v.mileage ?? "") || null);
        onVehicleChange("unit_number", v.unit_number ?? null);
        onVehicleChange("color", v.color ?? null);
        onVehicleChange(
          "engine_hours",
          v.engine_hours != null ? String(v.engine_hours) : null
        );
        onVehicleSelected?.(v.id);
      }
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="w-full max-w-4xl mx-auto space-y-8 text-white">
      {/* Heading */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-blackops text-orange-400">
            Customer & Vehicle
          </h1>
          <p className="text-xs text-neutral-400">
            Search existing customers and units, or enter new details.
          </p>
        </div>
        {workOrderExists && (
          <span className="rounded-full border border-emerald-500/60 bg-emerald-500/10 px-3 py-1 text-[11px] text-emerald-200">
            Linked to existing work order
          </span>
        )}
      </div>

      {/* Customer card */}
      <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-neutral-100">
            Customer Info
          </h2>
          <span className="text-[11px] text-neutral-500">
            Start typing to search existing customers in this shop.
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Business name + autocomplete */}
          <div className="sm:col-span-2 space-y-1">
            <label className="text-xs text-neutral-300">
              Business name{" "}
              <span className="text-neutral-500">(optional)</span>
            </label>
            <input
              className="input"
              placeholder="Business name"
              value={(customer as any).business_name ?? ""}
              onChange={(e) =>
                (onCustomerChange as any)(
                  "business_name",
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

          {/* First name */}
          <div className="space-y-1">
            <label className="text-xs text-neutral-300">First name</label>
            <input
              className="input"
              placeholder="First name"
              value={customer.first_name ?? ""}
              onChange={(e) =>
                onCustomerChange("first_name", e.target.value || null)
              }
            />
            <CustomerAutocomplete
              q={customer.first_name ?? ""}
              shopId={shopId}
              onPick={handlePickedCustomer}
            />
          </div>

          {/* Last name */}
          <div className="space-y-1">
            <label className="text-xs text-neutral-300">Last name</label>
            <input
              className="input"
              placeholder="Last name"
              value={customer.last_name ?? ""}
              onChange={(e) =>
                onCustomerChange("last_name", e.target.value || null)
              }
            />
            <CustomerAutocomplete
              q={customer.last_name ?? ""}
              shopId={shopId}
              onPick={handlePickedCustomer}
            />
          </div>

          {/* Phone */}
          <div className="space-y-1">
            <label className="text-xs text-neutral-300">Phone</label>
            <input
              className="input"
              placeholder="Phone"
              value={customer.phone ?? ""}
              onChange={(e) =>
                onCustomerChange("phone", e.target.value || null)
              }
            />
          </div>

          {/* Email */}
          <div className="space-y-1">
            <label className="text-xs text-neutral-300">Email</label>
            <input
              type="email"
              className="input"
              placeholder="Email"
              value={customer.email ?? ""}
              onChange={(e) =>
                onCustomerChange("email", e.target.value || null)
              }
            />
          </div>

          {/* Address */}
          <div className="sm:col-span-2 space-y-1">
            <label className="text-xs text-neutral-300">Address</label>
            <input
              className="input"
              placeholder="Street address"
              value={customer.address ?? ""}
              onChange={(e) =>
                onCustomerChange("address", e.target.value || null)
              }
            />
          </div>

          {/* City */}
          <div className="space-y-1">
            <label className="text-xs text-neutral-300">City</label>
            <input
              className="input"
              placeholder="City"
              value={customer.city ?? ""}
              onChange={(e) =>
                onCustomerChange("city", e.target.value || null)
              }
            />
          </div>

          {/* Province */}
          <div className="space-y-1">
            <label className="text-xs text-neutral-300">Province</label>
            <input
              className="input"
              placeholder="Province / State"
              value={customer.province ?? ""}
              onChange={(e) =>
                onCustomerChange("province", e.target.value || null)
              }
            />
          </div>

          {/* Postal code */}
          <div className="space-y-1">
            <label className="text-xs text-neutral-300">Postal code</label>
            <input
              className="input"
              placeholder="Postal code"
              value={customer.postal_code ?? ""}
              onChange={(e) =>
                onCustomerChange("postal_code", e.target.value || null)
              }
            />
          </div>
        </div>
      </div>

      {/* Vehicle card */}
      <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-neutral-100">
            Vehicle Info
          </h2>
          <span className="text-[11px] text-neutral-500">
            Use unit # or plate to pull an existing vehicle for this customer.
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Unit # + autocomplete */}
          <div className="space-y-1">
            <label className="text-xs text-neutral-300">Unit #</label>
            <input
              className="input"
              placeholder="Unit #"
              value={vehicle.unit_number ?? ""}
              onChange={(e) =>
                onVehicleChange("unit_number", e.target.value || null)
              }
            />
            <UnitNumberAutocomplete
              q={vehicle.unit_number ?? ""}
              shopId={shopId}
              customerId={currentCustomerId}
              onPick={(v) => {
                onVehicleChange("unit_number", v.unit_number ?? null);
                onVehicleChange("vin", (v.vin ?? "") || null);
                onVehicleChange(
                  "year",
                  v.year != null ? String(v.year) : null
                );
                onVehicleChange("make", v.make ?? null);
                onVehicleChange("model", v.model ?? null);
                onVehicleChange(
                  "license_plate",
                  v.license_plate ?? null
                );
                onVehicleChange("mileage", (v.mileage ?? "") || null);
                onVehicleChange("color", v.color ?? null);
                onVehicleChange(
                  "engine_hours",
                  v.engine_hours != null ? String(v.engine_hours) : null
                );
                onVehicleSelected?.(v.id);
              }}
            />
          </div>

          {/* Year */}
          <div className="space-y-1">
            <label className="text-xs text-neutral-300">Year</label>
            <input
              inputMode="numeric"
              className="input"
              placeholder="Year"
              value={vehicle.year ?? ""}
              onChange={(e) =>
                onVehicleChange("year", e.target.value || null)
              }
            />
          </div>

          {/* Make */}
          <div className="space-y-1">
            <label className="text-xs text-neutral-300">Make</label>
            <input
              className="input"
              placeholder="Make"
              value={vehicle.make ?? ""}
              onChange={(e) =>
                onVehicleChange("make", e.target.value || null)
              }
            />
          </div>

          {/* Model */}
          <div className="space-y-1">
            <label className="text-xs text-neutral-300">Model</label>
            <input
              className="input"
              placeholder="Model"
              value={vehicle.model ?? ""}
              onChange={(e) =>
                onVehicleChange("model", e.target.value || null)
              }
            />
          </div>

          {/* VIN */}
          <div className="space-y-1">
            <label className="text-xs text-neutral-300">VIN</label>
            <input
              className="input"
              placeholder="VIN"
              value={vehicle.vin ?? ""}
              onChange={(e) =>
                onVehicleChange("vin", e.target.value || null)
              }
            />
          </div>

          {/* Plate */}
          <div className="space-y-1">
            <label className="text-xs text-neutral-300">License plate</label>
            <input
              className="input"
              placeholder="License plate"
              value={vehicle.license_plate ?? ""}
              onChange={(e) =>
                onVehicleChange("license_plate", e.target.value || null)
              }
            />
          </div>

          {/* Mileage */}
          <div className="space-y-1">
            <label className="text-xs text-neutral-300">Mileage</label>
            <input
              inputMode="numeric"
              className="input"
              placeholder="Mileage"
              value={vehicle.mileage ?? ""}
              onChange={(e) =>
                onVehicleChange("mileage", e.target.value || null)
              }
            />
          </div>

          {/* Color */}
          <div className="space-y-1">
            <label className="text-xs text-neutral-300">Color</label>
            <input
              className="input"
              placeholder="Color"
              value={vehicle.color ?? ""}
              onChange={(e) =>
                onVehicleChange("color", e.target.value || null)
              }
            />
          </div>

          {/* Engine hours */}
          <div className="space-y-1">
            <label className="text-xs text-neutral-300">Engine hours</label>
            <input
              inputMode="numeric"
              className="input"
              placeholder="Engine hours"
              value={vehicle.engine_hours ?? ""}
              onChange={(e) =>
                onVehicleChange("engine_hours", e.target.value || null)
              }
            />
          </div>
        </div>
      </div>

      {/* Actions */}
      {(onSave || onClear) && (
        <div className="flex flex-wrap items-center gap-3 pt-2">
          {onSave && (
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="btn btn-orange disabled:opacity-60"
              title={
                workOrderExists
                  ? "Update Work Order with these details"
                  : "Create Work Order with these details"
              }
            >
              {saving
                ? "Saving…"
                : workOrderExists
                ? "Update & Continue"
                : "Save & Continue"}
            </button>
          )}

          {onClear && (
            <button
              type="button"
              onClick={onClear}
              className="rounded border border-neutral-700 px-3 py-1 text-sm hover:border-red-500"
              title="Clear Customer & Vehicle fields (does not delete an existing Work Order)"
            >
              Clear
            </button>
          )}

          {/* 🔵 DEBUG SHOP */}
          <button
            type="button"
            className="rounded border border-blue-600 px-3 py-1 text-xs text-blue-300 hover:bg-blue-900/20"
            onClick={async () => {
              try {
                const {
                  data: { user },
                } = await supabase.auth.getUser();
                const uid = user?.id ?? null;

                let profileShop: string | null = null;
                if (uid) {
                  const prof = await supabase
                    .from("profiles")
                    .select("user_id, shop_id")
                    .eq("user_id", uid)
                    .maybeSingle();

                  profileShop = prof.data?.shop_id ?? null;
                }

                alert(
                  JSON.stringify(
                    {
                      auth_uid: uid,
                      profile_shop_id: profileShop,
                      form_shop_id: shopId ?? null,
                    },
                    null,
                    2
                  )
                );
              } catch (err) {
                alert(
                  `Debug failed: ${
                    (err as Error)?.message || "unknown error"
                  }`
                );
              }
            }}
          >
            Debug Shop
          </button>

          {workOrderExists ? (
            <span className="text-xs text-neutral-400">
              Work order already exists — you can add lines now.
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}