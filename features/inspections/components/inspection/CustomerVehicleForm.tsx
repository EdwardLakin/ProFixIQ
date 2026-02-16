"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import type {
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
  created_at?: string | null;
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

  engine?: string | null;
  transmission?: string | null;
  fuel_type?: string | null;
  drivetrain?: string | null;

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
    field: keyof CustomerInfo,
    value: string | null,
  ) => void;
  onVehicleChange?: (field: keyof VehicleInfo, value: string | null) => void;
  onSave?: () => void | Promise<void>;
  onClear?: () => void;
  onCustomerSelected?: (customerId: string) => void;
  onVehicleSelected?: (vehicleId: string) => void;
};

/* Small helper to split a single "name" into first/last */
function splitNamefallback(
  n?: string | null,
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
            "id, business_name, first_name, last_name, name, phone, email, address, city, province, postal_code, created_at",
          )
          .eq("shop_id", shopId)
          .or(
            `business_name.ilike.${like},first_name.ilike.${like},last_name.ilike.${like},name.ilike.${like}`,
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
        <div
          className="
            absolute z-20 mt-1 w-full overflow-hidden rounded-xl
            border border-white/12
            bg-black/55 backdrop-blur-xl
            shadow-[0_18px_45px_rgba(0,0,0,0.70)]
          "
        >
          {busy && (
            <div className="px-3 py-2 text-xs text-white/60">Searching…</div>
          )}
          {rows.map((c) => {
            const contact = [c.first_name, c.last_name].filter(Boolean).join(" ");
            const top = c.business_name || contact || c.name || "Unnamed";
            const sub =
              c.business_name && contact
                ? contact
                : [c.phone, c.email].filter(Boolean).join(" · ");
            return (
              <button
                key={c.id}
                type="button"
                className="
                  block w-full cursor-pointer px-3 py-2 text-left text-sm transition
                  hover:bg-[color:var(--accent-copper-900,rgba(120,63,28,0.20))]
                  hover:text-white
                "
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onPick(c);
                  setOpen(false);
                }}
              >
                <div className="truncate text-white/90">{top}</div>
                <div className="truncate text-xs text-white/50">{sub || "—"}</div>
              </button>
            );
          })}
          {!busy && rows.length === 0 && (
            <div className="px-3 py-2 text-xs text-white/45">No matches</div>
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
            "id, unit_number, license_plate, vin, year, make, model, mileage, color, engine_hours, engine, transmission, fuel_type, drivetrain, customer_id, created_at",
          )
          .eq("shop_id", shopId)
          .eq("customer_id", customerId)
          .or(
            `unit_number.ilike.${like},license_plate.ilike.${like},vin.ilike.${like},model.ilike.${like}`,
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
        <div
          className="
            absolute z-20 mt-1 w-full overflow-hidden rounded-xl
            border border-white/12
            bg-black/55 backdrop-blur-xl
            shadow-[0_18px_45px_rgba(0,0,0,0.70)]
          "
        >
          {busy && (
            <div className="px-3 py-2 text-xs text-white/60">Searching…</div>
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
                className="
                  block w-full cursor-pointer px-3 py-2 text-left text-sm transition
                  hover:bg-[color:var(--accent-copper-900,rgba(120,63,28,0.20))]
                  hover:text-white
                "
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onPick(v);
                  setOpen(false);
                }}
              >
                <div className="truncate text-white/90">{title}</div>
                <div className="truncate text-xs text-white/50">{sub || "—"}</div>
              </button>
            );
          })}
          {!busy && rows.length === 0 && (
            <div className="px-3 py-2 text-xs text-white/45">No matches</div>
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

  const {
    onCustomerChange = () => {},
    onVehicleChange = () => {},
    onSave,
    onClear,
    onCustomerSelected,
    onVehicleSelected,
  } = (handlers as Handlers) ?? {};

  const [currentCustomerId, setCurrentCustomerId] = useState<string | null>(null);

  const safeSetCustomer = useCallback(
    (field: keyof CustomerInfo, value: string | null | undefined) => {
      onCustomerChange(field, value ?? null);
    },
    [onCustomerChange],
  );

  const safeSetVehicle = useCallback(
    (field: keyof VehicleInfo, value: string | null | undefined) => {
      onVehicleChange(field, value ?? null);
    },
    [onVehicleChange],
  );

  async function handlePickedCustomer(c: CustomerRow) {
    const fallback = splitNamefallback(c.name);

    // Fill immediate customer fields
    safeSetCustomer("business_name", c.business_name ?? null);
    safeSetCustomer("name", c.name ?? null);
    safeSetCustomer("first_name", c.first_name ?? fallback.first ?? null);
    safeSetCustomer("last_name", c.last_name ?? fallback.last ?? null);
    safeSetCustomer("phone", c.phone ?? null);
    safeSetCustomer("email", c.email ?? null);

    // Fill remaining fields
    try {
      const { data } = await supabase
        .from("customers")
        .select("*")
        .eq("id", c.id)
        .maybeSingle();

      if (data) {
        const d = data as CustomerRow;
        const fb = splitNamefallback(d.name);

        safeSetCustomer("business_name", d.business_name ?? null);
        safeSetCustomer("name", d.name ?? null);
        safeSetCustomer("first_name", d.first_name ?? fb.first ?? null);
        safeSetCustomer("last_name", d.last_name ?? fb.last ?? null);
        safeSetCustomer("address", d.address ?? null);
        safeSetCustomer("city", d.city ?? null);
        safeSetCustomer("province", d.province ?? null);
        safeSetCustomer("postal_code", d.postal_code ?? null);
      }
    } catch {
      /* ignore */
    }

    onCustomerSelected?.(c.id);
    setCurrentCustomerId(c.id);

    // If they only have one vehicle, auto-fill it
    try {
      const { data: vehs } = await supabase
        .from("vehicles")
        .select(
          "id, vin, year, make, model, license_plate, mileage, unit_number, color, engine_hours, engine, transmission, fuel_type, drivetrain, created_at",
        )
        .eq("customer_id", c.id)
        .eq("shop_id", shopId)
        .order("created_at", { ascending: false })
        .limit(2);

      const arr = (vehs ?? []) as VehicleRow[];
      if (arr.length === 1) {
        const v = arr[0];
        safeSetVehicle("vin", v.vin ?? null);
        safeSetVehicle("year", v.year != null ? String(v.year) : null);
        safeSetVehicle("make", v.make ?? null);
        safeSetVehicle("model", v.model ?? null);
        safeSetVehicle("license_plate", v.license_plate ?? null);
        safeSetVehicle("mileage", v.mileage ?? null);
        safeSetVehicle("unit_number", v.unit_number ?? null);
        safeSetVehicle("color", v.color ?? null);
        safeSetVehicle(
          "engine_hours",
          v.engine_hours != null ? String(v.engine_hours) : null,
        );

        safeSetVehicle("engine", v.engine ?? null);
        safeSetVehicle("transmission", v.transmission ?? null);
        safeSetVehicle("fuel_type", v.fuel_type ?? null);
        safeSetVehicle("drivetrain", v.drivetrain ?? null);

        onVehicleSelected?.(v.id);
      }
    } catch {
      /* ignore */
    }
  }

  const handleSaveClick = async () => {
    try {
      if (onSave) await onSave();

      // After save: fire-and-forget rule generation for this YMM (+ engine)
      const yearStr = vehicle.year ?? null;
      const year = yearStr ? parseInt(yearStr, 10) : null;
      const make = vehicle.make?.trim() || "";
      const model = vehicle.model?.trim() || "";
      const engineFamily = vehicle.engine ?? null;

      if (!year || !make || !model) return;

      void fetch("/api/maintenance/generate-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, make, model, engineFamily }),
      }).catch(() => {});
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Save & rule generation failed", err);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-6 text-white">
      {/* Header card */}
      <section className="rounded-2xl border border-white/10 bg-black/35 px-4 py-4 shadow-[0_18px_45px_rgba(0,0,0,0.70)] backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-blackops tracking-[0.16em] text-[var(--accent-copper-light)]">
              Customer &amp; Vehicle
            </h1>
            <p className="mt-1 text-[0.75rem] text-white/55">
              Search existing customers and units, or enter new details to attach
              to this visit.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {workOrderExists && (
              <span className="rounded-full border border-emerald-500/45 bg-emerald-500/10 px-3 py-1 text-[11px] font-medium text-emerald-200 shadow-[0_0_18px_rgba(16,185,129,0.18)]">
                Linked to existing work order
              </span>
            )}
            {shopId && (
              <span className="rounded-full border border-white/10 bg-black/35 px-3 py-1 text-[11px] font-mono text-white/55">
                Shop&nbsp;
                <span className="text-[var(--accent-copper-soft)]">
                  {shopId.slice(0, 8)}
                </span>
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Main grid: Customer / Vehicle */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr),minmax(0,1.1fr)]">
        {/* Customer card */}
        <section className="rounded-2xl border border-white/10 bg-black/35 px-4 py-4 shadow-[0_18px_45px_rgba(0,0,0,0.70)] backdrop-blur-xl sm:px-6 sm:py-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-white sm:text-base">
              Customer Info
            </h2>
            <span className="text-[11px] text-white/45">
              Start typing to search existing customers in this shop.
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Business name + autocomplete */}
            <div className="sm:col-span-2 space-y-1">
              <label className="text-xs text-white/60">
                Business name <span className="text-white/35">(optional)</span>
              </label>
              <input
                className="input"
                placeholder="Business name"
                value={customer.business_name ?? ""}
                onChange={(e) =>
                  safeSetCustomer("business_name", e.target.value || null)
                }
              />
              <CustomerAutocomplete
                q={customer.business_name ?? ""}
                shopId={shopId}
                onPick={handlePickedCustomer}
              />
            </div>

            {/* First name */}
            <div className="space-y-1">
              <label className="text-xs text-white/60">First name</label>
              <input
                className="input"
                placeholder="First name"
                value={customer.first_name ?? ""}
                onChange={(e) => safeSetCustomer("first_name", e.target.value || null)}
              />
              <CustomerAutocomplete
                q={customer.first_name ?? ""}
                shopId={shopId}
                onPick={handlePickedCustomer}
              />
            </div>

            {/* Last name */}
            <div className="space-y-1">
              <label className="text-xs text-white/60">Last name</label>
              <input
                className="input"
                placeholder="Last name"
                value={customer.last_name ?? ""}
                onChange={(e) => safeSetCustomer("last_name", e.target.value || null)}
              />
              <CustomerAutocomplete
                q={customer.last_name ?? ""}
                shopId={shopId}
                onPick={handlePickedCustomer}
              />
            </div>

            {/* Phone */}
            <div className="space-y-1">
              <label className="text-xs text-white/60">Phone</label>
              <input
                className="input"
                placeholder="Phone"
                value={customer.phone ?? ""}
                onChange={(e) => safeSetCustomer("phone", e.target.value || null)}
              />
            </div>

            {/* Email */}
            <div className="space-y-1">
              <label className="text-xs text-white/60">Email</label>
              <input
                type="email"
                className="input"
                placeholder="Email"
                value={customer.email ?? ""}
                onChange={(e) => safeSetCustomer("email", e.target.value || null)}
              />
            </div>

            {/* Address */}
            <div className="sm:col-span-2 space-y-1">
              <label className="text-xs text-white/60">Address</label>
              <input
                className="input"
                placeholder="Street address"
                value={customer.address ?? ""}
                onChange={(e) => safeSetCustomer("address", e.target.value || null)}
              />
            </div>

            {/* City */}
            <div className="space-y-1">
              <label className="text-xs text-white/60">City</label>
              <input
                className="input"
                placeholder="City"
                value={customer.city ?? ""}
                onChange={(e) => safeSetCustomer("city", e.target.value || null)}
              />
            </div>

            {/* Province */}
            <div className="space-y-1">
              <label className="text-xs text-white/60">Province</label>
              <input
                className="input"
                placeholder="Province / State"
                value={customer.province ?? ""}
                onChange={(e) => safeSetCustomer("province", e.target.value || null)}
              />
            </div>

            {/* Postal code */}
            <div className="space-y-1">
              <label className="text-xs text-white/60">Postal code</label>
              <input
                className="input"
                placeholder="Postal code"
                value={customer.postal_code ?? ""}
                onChange={(e) =>
                  safeSetCustomer("postal_code", e.target.value || null)
                }
              />
            </div>
          </div>
        </section>

        {/* Vehicle card */}
        <section className="rounded-2xl border border-white/10 bg-black/35 px-4 py-4 shadow-[0_18px_45px_rgba(0,0,0,0.70)] backdrop-blur-xl sm:px-6 sm:py-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-white sm:text-base">
              Vehicle Info
            </h2>
            <span className="text-[11px] text-white/45">
              Use unit # or plate to pull an existing vehicle for this customer.
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Unit # + autocomplete */}
            <div className="space-y-1">
              <label className="text-xs text-white/60">Unit #</label>
              <input
                className="input"
                placeholder="Unit #"
                value={vehicle.unit_number ?? ""}
                onChange={(e) =>
                  safeSetVehicle("unit_number", e.target.value || null)
                }
              />
              <UnitNumberAutocomplete
                q={vehicle.unit_number ?? ""}
                shopId={shopId}
                customerId={currentCustomerId}
                onPick={(v) => {
                  safeSetVehicle("unit_number", v.unit_number ?? null);
                  safeSetVehicle("vin", v.vin ?? null);
                  safeSetVehicle("year", v.year != null ? String(v.year) : null);
                  safeSetVehicle("make", v.make ?? null);
                  safeSetVehicle("model", v.model ?? null);
                  safeSetVehicle("license_plate", v.license_plate ?? null);
                  safeSetVehicle("mileage", v.mileage ?? null);
                  safeSetVehicle("color", v.color ?? null);
                  safeSetVehicle(
                    "engine_hours",
                    v.engine_hours != null ? String(v.engine_hours) : null,
                  );

                  safeSetVehicle("engine", v.engine ?? null);
                  safeSetVehicle("transmission", v.transmission ?? null);
                  safeSetVehicle("fuel_type", v.fuel_type ?? null);
                  safeSetVehicle("drivetrain", v.drivetrain ?? null);

                  onVehicleSelected?.(v.id);
                }}
              />
            </div>

            {/* Year */}
            <div className="space-y-1">
              <label className="text-xs text-white/60">Year</label>
              <input
                inputMode="numeric"
                className="input"
                placeholder="Year"
                value={vehicle.year ?? ""}
                onChange={(e) => safeSetVehicle("year", e.target.value || null)}
              />
            </div>

            {/* Make */}
            <div className="space-y-1">
              <label className="text-xs text-white/60">Make</label>
              <input
                className="input"
                placeholder="Make"
                value={vehicle.make ?? ""}
                onChange={(e) => safeSetVehicle("make", e.target.value || null)}
              />
            </div>

            {/* Model */}
            <div className="space-y-1">
              <label className="text-xs text-white/60">Model</label>
              <input
                className="input"
                placeholder="Model"
                value={vehicle.model ?? ""}
                onChange={(e) => safeSetVehicle("model", e.target.value || null)}
              />
            </div>

            {/* VIN */}
            <div className="space-y-1">
              <label className="text-xs text-white/60">VIN</label>
              <input
                className="input"
                placeholder="VIN"
                value={vehicle.vin ?? ""}
                onChange={(e) => safeSetVehicle("vin", e.target.value || null)}
              />
            </div>

            {/* Plate */}
            <div className="space-y-1">
              <label className="text-xs text-white/60">License plate</label>
              <input
                className="input"
                placeholder="License plate"
                value={vehicle.license_plate ?? ""}
                onChange={(e) =>
                  safeSetVehicle("license_plate", e.target.value || null)
                }
              />
            </div>

            {/* Mileage */}
            <div className="space-y-1">
              <label className="text-xs text-white/60">Mileage</label>
              <input
                inputMode="numeric"
                className="input"
                placeholder="Mileage"
                value={vehicle.mileage ?? ""}
                onChange={(e) => safeSetVehicle("mileage", e.target.value || null)}
              />
            </div>

            {/* Color */}
            <div className="space-y-1">
              <label className="text-xs text-white/60">Color</label>
              <input
                className="input"
                placeholder="Color"
                value={vehicle.color ?? ""}
                onChange={(e) => safeSetVehicle("color", e.target.value || null)}
              />
            </div>

            {/* Engine hours */}
            <div className="space-y-1">
              <label className="text-xs text-white/60">Engine hours</label>
              <input
                inputMode="numeric"
                className="input"
                placeholder="Engine hours"
                value={vehicle.engine_hours ?? ""}
                onChange={(e) =>
                  safeSetVehicle("engine_hours", e.target.value || null)
                }
              />
            </div>

            {/* Engine / trim */}
            <div className="space-y-1">
              <label className="text-xs text-white/60">Engine / Trim</label>
              <input
                className="input"
                placeholder="e.g. 3.5L EcoBoost"
                value={vehicle.engine ?? ""}
                onChange={(e) => safeSetVehicle("engine", e.target.value || null)}
              />
            </div>

            {/* Transmission */}
            <div className="space-y-1">
              <label className="text-xs text-white/60">Transmission</label>
              <select
                className="input"
                value={vehicle.transmission ?? ""}
                onChange={(e) =>
                  safeSetVehicle("transmission", e.target.value || null)
                }
              >
                <option value="">Select transmission</option>
                <option value="automatic">Automatic</option>
                <option value="manual">Manual</option>
                <option value="cvt">CVT</option>
                <option value="dct">Dual-clutch</option>
                <option value="other">Other</option>
              </select>
            </div>

            {/* Fuel type */}
            <div className="space-y-1">
              <label className="text-xs text-white/60">Fuel type</label>
              <select
                className="input"
                value={vehicle.fuel_type ?? ""}
                onChange={(e) =>
                  safeSetVehicle("fuel_type", e.target.value || null)
                }
              >
                <option value="">Select fuel type</option>
                <option value="gasoline">Gasoline</option>
                <option value="diesel">Diesel</option>
                <option value="hybrid">Hybrid</option>
                <option value="phev">Plug-in hybrid</option>
                <option value="ev">Electric (BEV)</option>
                <option value="other">Other</option>
              </select>
            </div>

            {/* Drivetrain */}
            <div className="space-y-1">
              <label className="text-xs text-white/60">Drivetrain</label>
              <select
                className="input"
                value={vehicle.drivetrain ?? ""}
                onChange={(e) =>
                  safeSetVehicle("drivetrain", e.target.value || null)
                }
              >
                <option value="">Select drivetrain</option>
                <option value="fwd">FWD</option>
                <option value="rwd">RWD</option>
                <option value="awd">AWD</option>
                <option value="4x4">4x4</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
        </section>
      </div>

      {/* Actions */}
      {(onSave || onClear) && (
        <div className="flex flex-wrap items-center gap-3 pt-2">
          {onSave && (
            <button
              type="button"
              onClick={handleSaveClick}
              disabled={saving}
              className="
                inline-flex items-center rounded-full
                bg-[var(--accent-copper)]
                px-4 py-2 text-sm font-semibold text-black
                shadow-[0_0_25px_rgba(0,0,0,0.85)]
                transition hover:opacity-90
                disabled:cursor-not-allowed disabled:opacity-60
              "
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
              className="
                inline-flex items-center rounded-full
                border border-white/12 bg-white/5
                px-3 py-1.5 text-xs sm:text-sm text-white/75
                transition hover:border-red-400/60 hover:bg-red-950/35 hover:text-red-200
              "
              title="Clear Customer & Vehicle fields (does not delete an existing Work Order)"
            >
              Clear
            </button>
          )}

          {workOrderExists ? (
            <span className="text-xs text-white/45">
              Work order already exists — you can add lines now.
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}