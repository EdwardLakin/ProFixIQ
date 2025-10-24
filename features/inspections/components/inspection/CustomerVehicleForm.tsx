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
  first_name?: string | null;
  last_name?: string | null;
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
};

/** ✅ Public props are now fully serializable */
interface Props {
  customer: CustomerInfo;
  vehicle: VehicleInfo;

  /** Optional UI bits */
  saving?: boolean;
  workOrderExists?: boolean;
  shopId?: string | null;

  /** One object for callbacks; typed as unknown to keep props serializable */
  handlers?: unknown;
}

/** Internal view of handlers (kept private to this file) */
type Handlers = {
  onCustomerChange?: (field: keyof CustomerInfo, value: string | null) => void;
  onVehicleChange?: (field: keyof VehicleInfo, value: string | null) => void;
  onSave?: () => void;
  onClear?: () => void;
  onCustomerSelected?: (customerId: string) => void;
  onVehicleSelected?: (vehicleId: string) => void;
};

/* -------------------------------------------------------------------------- */
/* Autocomplete: First Name                                                   */
/* -------------------------------------------------------------------------- */

function FirstNameAutocomplete({
  q,
  shopId,
  onPick,
}: {
  q: string;
  shopId?: string | null;
  onPick: (c: CustomerRow) => void;
}) {
  const supabase = useMemo(() => createClientComponentClient<Database>(), []);
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // helper: prefer first+last; fall back to name
  const displayName = (c: Partial<CustomerRow> & { name?: string | null }) =>
    [c.first_name, c.last_name].filter(Boolean).join(" ") || (c as any).name || "Unnamed";

  useEffect(() => {
    const term = (q ?? "").trim();

    if (!term) {
      setRows([]);
      setOpen(false);
      return;
    }

    setOpen(true);

    const t = window.setTimeout(async () => {
      setBusy(true);
      const like = `${term}%`;

      // build a base selector that asks for both name styles
      const base = supabase
        .from("customers")
        .select("id, first_name, last_name, name, phone, email, shop_id")
        // search against first_name OR last_name OR name
        .or(
          [
            `first_name.ilike.${like}`,
            `last_name.ilike.${like}`,
            `name.ilike.${like}`, // if your table has a single "name" column
          ].join(","),
        )
        .order("updated_at", { ascending: false })
        .limit(12);

      try {
        // 1) try shop-scoped (if we have a shop)
        let data: any[] | null = null;
        if (shopId) {
          const scoped = await base.eq("shop_id", shopId);
          if (!scoped.error) data = scoped.data ?? null;
        }

        // 2) fallback global if nothing found
        if (!data || data.length === 0) {
          const global = await base;
          if (global.error) throw global.error;
          data = global.data ?? [];
        }

        setRows((data as CustomerRow[]) ?? []);
      } catch {
        setRows([]);
      } finally {
        setBusy(false);
      }
    }, 150);

    return () => window.clearTimeout(t);
  }, [q, shopId, supabase]);

  // Close on outside click
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
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded border border-neutral-700 bg-neutral-900 shadow">
          {busy && <div className="px-3 py-2 text-xs text-neutral-400">Searching…</div>}
          {rows.map((c) => {
            const name = displayName(c as any);
            const sub = [c.phone, c.email].filter(Boolean).join(" · ");
            return (
              <button
                key={c.id}
                type="button"
                className="block w-full cursor-pointer px-3 py-2 text-left hover:bg-neutral-800"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onPick(c);
                  setOpen(false);
                }}
              >
                <div className="truncate">{name}</div>
                <div className="truncate text-xs text-neutral-400">{sub || "—"}</div>
              </button>
            );
          })}
          {!busy && rows.length === 0 && (
            <div className="px-3 py-2 text-xs text-neutral-400">No matches</div>
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
  shopId,
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

  async function handlePickedCustomer(c: CustomerRow) {
    onCustomerChange("first_name", c.first_name ?? null);
    onCustomerChange("last_name", c.last_name ?? null);
    onCustomerChange("phone", c.phone ?? null);
    onCustomerChange("email", c.email ?? null);

    try {
      const { data } = await supabase.from("customers").select("*").eq("id", c.id).maybeSingle();
      if (data) {
        const d = data as CustomerRow;
        onCustomerChange("address", d.address ?? null);
        onCustomerChange("city", d.city ?? null);
        onCustomerChange("province", d.province ?? null);
        onCustomerChange("postal_code", d.postal_code ?? null);
      }
    } catch {}

    onCustomerSelected?.(c.id);

    try {
      const { data: vehs } = await supabase
        .from("vehicles")
        .select("id, vin, year, make, model, license_plate, mileage, unit_number, color, engine_hours")
        .eq("customer_id", c.id)
        .order("updated_at", { ascending: false })
        .limit(2);

      const arr = (vehs ?? []) as VehicleRow[];
      if (arr.length === 1) {
        const v = arr[0];
        onVehicleChange("vin", (v.vin ?? "") || null);
        onVehicleChange("year", v.year != null ? String(v.year) : null);
        onVehicleChange("make", v.make ?? null);
        onVehicleChange("model", v.model ?? null);
        onVehicleChange("license_plate", v.license_plate ?? null);
        onVehicleChange("mileage", (v.mileage ?? "") || null);
        onVehicleChange("unit_number", v.unit_number ?? null);
        onVehicleChange("color", v.color ?? null);
        onVehicleChange("engine_hours", v.engine_hours != null ? String(v.engine_hours) : null);
        onVehicleSelected?.(v.id);
      }
    } catch {}
  }

  return (
    <div className="w-full max-w-3xl mx-auto text-white space-y-8">
      {/* Customer */}
      <h2 className="font-blackops text-xl border-b border-orange-400 pb-2">
        Customer Info
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* First name + autocomplete */}
        <div className="sm:col-span-1">
          <input
            className="input"
            placeholder="First Name"
            value={customer.first_name ?? ""}
            onChange={(e) => onCustomerChange("first_name", e.target.value || null)}
          />
          <FirstNameAutocomplete
            q={customer.first_name ?? ""}
            shopId={shopId ?? null}
            onPick={handlePickedCustomer}
          />
        </div>

        <input
          className="input"
          placeholder="Last Name"
          value={customer.last_name ?? ""}
          onChange={(e) => onCustomerChange("last_name", e.target.value || null)}
        />
        <input
          className="input"
          placeholder="Phone"
          value={customer.phone ?? ""}
          onChange={(e) => onCustomerChange("phone", e.target.value || null)}
        />
        <input
          type="email"
          className="input"
          placeholder="Email"
          value={customer.email ?? ""}
          onChange={(e) => onCustomerChange("email", e.target.value || null)}
        />
        <input
          className="input sm:col-span-2"
          placeholder="Address"
          value={customer.address ?? ""}
          onChange={(e) => onCustomerChange("address", e.target.value || null)}
        />
        <input
          className="input"
          placeholder="City"
          value={customer.city ?? ""}
          onChange={(e) => onCustomerChange("city", e.target.value || null)}
        />
        <input
          className="input"
          placeholder="Province"
          value={customer.province ?? ""}
          onChange={(e) => onCustomerChange("province", e.target.value || null)}
        />
        <input
          className="input"
          placeholder="Postal Code"
          value={customer.postal_code ?? ""}
          onChange={(e) => onCustomerChange("postal_code", e.target.value || null)}
        />
      </div>

      {/* Vehicle */}
      <h2 className="font-blackops text-xl border-b border-orange-400 pb-2">
        Vehicle Info
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <input
          inputMode="numeric"
          className="input"
          placeholder="Year"
          value={vehicle.year ?? ""}
          onChange={(e) => onVehicleChange("year", e.target.value || null)}
        />
        <input
          className="input"
          placeholder="Make"
          value={vehicle.make ?? ""}
          onChange={(e) => onVehicleChange("make", e.target.value || null)}
        />
        <input
          className="input"
          placeholder="Model"
          value={vehicle.model ?? ""}
          onChange={(e) => onVehicleChange("model", e.target.value || null)}
        />
        <input
          className="input"
          placeholder="VIN"
          value={vehicle.vin ?? ""}
          onChange={(e) => onVehicleChange("vin", e.target.value || null)}
        />
        <input
          className="input"
          placeholder="License Plate"
          value={vehicle.license_plate ?? ""}
          onChange={(e) => onVehicleChange("license_plate", e.target.value || null)}
        />
        <input
          inputMode="numeric"
          className="input"
          placeholder="Mileage"
          value={vehicle.mileage ?? ""}
          onChange={(e) => onVehicleChange("mileage", e.target.value || null)}
        />
        <input
          className="input"
          placeholder="Color"
          value={vehicle.color ?? ""}
          onChange={(e) => onVehicleChange("color", e.target.value || null)}
        />
        <input
          className="input"
          placeholder="Unit #"
          value={vehicle.unit_number ?? ""}
          onChange={(e) => onVehicleChange("unit_number", e.target.value || null)}
        />
        <input
          inputMode="numeric"
          className="input"
          placeholder="Engine Hours"
          value={vehicle.engine_hours ?? ""}
          onChange={(e) => onVehicleChange("engine_hours", e.target.value || null)}
        />
      </div>

      {/* Actions */}
      {(onSave || onClear) && (
        <div className="pt-2 flex flex-wrap items-center gap-3">
          {onSave && (
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="btn btn-orange disabled:opacity-60"
              title={workOrderExists ? "Update Work Order with these details" : "Create Work Order with these details"}
            >
              {saving ? "Saving…" : workOrderExists ? "Update & Continue" : "Save & Continue"}
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