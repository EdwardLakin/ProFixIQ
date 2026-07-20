"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import type {
  SessionCustomer as CustomerInfo,
  SessionVehicle,
} from "@inspections/lib/inspection/types";
import { normalizeCustomerForIntake } from "@inspections/lib/customerNormalization";
import { normalizeVinInput } from "@/features/shared/lib/vin/normalizeVin";
import { checkVehicleDuplicates, type VehicleDuplicateMatch } from "@/features/shared/lib/vehicles/duplicateCheck";

type VehicleInfo = SessionVehicle & {
  submodel?: string | null;
  engine_family?: string | null;
  engine_type?: string | null;
  transmission_type?: string | null;
};

/** Local, narrow shapes (avoid exporting DB row types in props) */
type CustomerRow = {
  id: string;
  business_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
  phone?: string | null;
  phone_number?: string | null;
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
  submodel?: string | null;
  engine_family?: string | null;
  engine_type?: string | null;
  transmission?: string | null;
  transmission_type?: string | null;
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

  /** Existing rows selected by a handoff or picker; prevents duplicate creates. */
  selectedCustomerId?: string | null;
  selectedVehicleId?: string | null;

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

function hydrateCustomerFields(c: CustomerRow): CustomerInfo {
  return normalizeCustomerForIntake(c);
}

function hydrateVehicleFields(v: VehicleRow): VehicleInfo {
  return {
    vin: v.vin ?? null,
    year: v.year != null ? String(v.year) : null,
    make: v.make ?? null,
    model: v.model ?? null,
    license_plate: v.license_plate ?? null,
    mileage: v.mileage ?? null,
    unit_number: v.unit_number ?? null,
    color: v.color ?? null,
    engine_hours: v.engine_hours != null ? String(v.engine_hours) : null,
    engine: v.engine ?? null,
    submodel: v.submodel ?? null,
    engine_family: v.engine_family ?? null,
    engine_type: v.engine_type ?? null,
    transmission: v.transmission ?? null,
    transmission_type: v.transmission_type ?? null,
    fuel_type: v.fuel_type ?? null,
    drivetrain: v.drivetrain ?? null,
  };
}

/* -------------------------------------------------------------------------- */
/* Autocomplete: Customer (business + first/last, STRICT same-shop)           */
/* -------------------------------------------------------------------------- */

type CustomerVehicleSearchPick = {
  customer: CustomerRow;
  vehicle: VehicleRow | null;
};

function CustomerAutocomplete({
  q,
  shopId,
  suspended,
  onPick,
}: {
  q: string;
  shopId: string | null;
  suspended: boolean;
  onPick: (pick: CustomerVehicleSearchPick) => void;
}) {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [rows, setRows] = useState<CustomerVehicleSearchPick[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const reqCounter = useRef(0);

  useEffect(() => {
    const term = (q ?? "").trim();

    if (suspended) {
      reqCounter.current += 1;
      setRows([]);
      setOpen(false);
      setBusy(false);
      return;
    }

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
        const escapedTerm = term.replaceAll("%", "").replaceAll("_", "");
        const like = `%${escapedTerm}%`;
        const { data: customerRows, error: customerError } = await supabase
          .from("customers")
          .select(
            "id, business_name, first_name, last_name, name, phone, phone_number, email, address, city, province, postal_code, created_at",
          )
          .eq("shop_id", shopId)
          .or(
            [
              `business_name.ilike.${like}`,
              `first_name.ilike.${like}`,
              `last_name.ilike.${like}`,
              `name.ilike.${like}`,
              `email.ilike.${like}`,
              `phone.ilike.${like}`,
              `phone_number.ilike.${like}`,
            ].join(","),
          )
          .order("created_at", { ascending: false })
          .limit(12);

        if (customerError) throw customerError;

        const customers = (customerRows ?? []) as CustomerRow[];
        const customerIds = customers.map((customer) => customer.id);
        let vehicles: VehicleRow[] = [];

        if (customerIds.length > 0) {
          const { data: vehicleRows, error: vehicleError } = await supabase
            .from("vehicles")
            .select(
              "id, unit_number, license_plate, vin, year, make, model, mileage, color, engine_hours, engine, submodel, engine_family, engine_type, transmission, transmission_type, fuel_type, drivetrain, customer_id, created_at",
            )
            .eq("shop_id", shopId)
            .in("customer_id", customerIds)
            .order("created_at", { ascending: false })
            .limit(48);

          if (vehicleError) throw vehicleError;
          vehicles = (vehicleRows ?? []) as VehicleRow[];
        }

        const vehiclesByCustomer = new Map<string, VehicleRow[]>();
        for (const vehicle of vehicles) {
          if (!vehicle.customer_id) continue;
          const existing = vehiclesByCustomer.get(vehicle.customer_id) ?? [];
          existing.push(vehicle);
          vehiclesByCustomer.set(vehicle.customer_id, existing);
        }

        const matches: CustomerVehicleSearchPick[] = [];
        for (const customer of customers) {
          const customerVehicles = vehiclesByCustomer.get(customer.id) ?? [];
          if (customerVehicles.length === 0) {
            matches.push({ customer, vehicle: null });
          } else {
            for (const vehicle of customerVehicles) {
              matches.push({ customer, vehicle });
            }
          }
        }

        if (thisReq === reqCounter.current) setRows(matches.slice(0, 12));
      } catch {
        if (thisReq === reqCounter.current) setRows([]);
      } finally {
        if (thisReq === reqCounter.current) setBusy(false);
      }
    }, 150);

    return () => window.clearTimeout(t);
  }, [q, shopId, supabase, suspended]);

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
            border border-[color:var(--desktop-border)]
            bg-[color:var(--desktop-panel-bg-soft)] backdrop-blur-xl
            shadow-[var(--theme-shadow-medium)]
          "
        >
          {busy && (
            <div className="px-3 py-2 text-xs text-[color:var(--theme-text-muted)]">Searching…</div>
          )}
          {rows.map(({ customer: c, vehicle: v }) => {
            const normalized = hydrateCustomerFields(c);
            const contact = [normalized.first_name, normalized.last_name]
              .filter(Boolean)
              .join(" ");
            const top =
              normalized.business_name || contact || normalized.name || "Unnamed";
            const vehicleLabel = v
              ? [
                  v.unit_number ? `Unit ${v.unit_number}` : null,
                  v.license_plate ? `Plate ${v.license_plate}` : null,
                  [v.year, v.make, v.model].filter(Boolean).join(" "),
                ]
                  .filter(Boolean)
                  .join(" · ")
              : "No vehicle on file";
            const contactLabel = [contact, normalized.phone, normalized.email]
              .filter(Boolean)
              .join(" · ");
            return (
              <button
                key={`${c.id}:${v?.id ?? "no-vehicle"}`}
                type="button"
                className="
                  block w-full cursor-pointer px-3 py-2 text-left text-sm transition
                  hover:bg-[color:var(--accent-copper-900,rgba(120,63,28,0.20))]
                  hover:text-[color:var(--theme-text-primary)]
                "
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onPick({ customer: c, vehicle: v });
                  setOpen(false);
                }}
              >
                <div className="truncate text-[color:var(--theme-text-primary)]">{top}</div>
                <div className="truncate text-xs text-[color:var(--theme-text-secondary)]">{vehicleLabel}</div>
                <div className="truncate text-[11px] text-[color:var(--theme-text-muted)]">{contactLabel || "—"}</div>
              </button>
            );
          })}
          {!busy && rows.length === 0 && (
            <div className="px-3 py-2 text-xs text-[color:var(--theme-text-muted)]">No matches</div>
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
  onPick,
}: {
  q: string;
  shopId: string | null;
  onPick: (v: VehicleRow) => void;
}) {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [rows, setRows] = useState<VehicleRow[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const reqCounter = useRef(0);

  useEffect(() => {
    const term = (q ?? "").trim();

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
        const escapedTerm = term.replaceAll("%", "").replaceAll("_", "");
        const like = `%${escapedTerm}%`;
        const { data, error } = await supabase
          .from("vehicles")
          .select(
            "id, unit_number, license_plate, vin, year, make, model, mileage, color, engine_hours, engine, submodel, engine_family, engine_type, transmission, transmission_type, fuel_type, drivetrain, customer_id, created_at",
          )
          .eq("shop_id", shopId)
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
            border border-[color:var(--desktop-border)]
            bg-[color:var(--desktop-panel-bg-soft)] backdrop-blur-xl
            shadow-[var(--theme-shadow-medium)]
          "
        >
          {busy && (
            <div className="px-3 py-2 text-xs text-[color:var(--theme-text-muted)]">Searching…</div>
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
                  hover:text-[color:var(--theme-text-primary)]
                "
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onPick(v);
                  setOpen(false);
                }}
              >
                <div className="truncate text-[color:var(--theme-text-primary)]">{title}</div>
                <div className="truncate text-xs text-[color:var(--theme-text-muted)]">{sub || "—"}</div>
              </button>
            );
          })}
          {!busy && rows.length === 0 && (
            <div className="px-3 py-2 text-xs text-[color:var(--theme-text-muted)]">No matches</div>
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
  selectedCustomerId = null,
  selectedVehicleId = null,
  handlers,
}: Props) {
  const supabase = useMemo(() => createBrowserSupabase(), []);

  const {
    onCustomerChange = () => {},
    onVehicleChange = () => {},
    onSave,
    onClear,
    onCustomerSelected,
    onVehicleSelected,
  } = (handlers as Handlers) ?? {};

  const [currentCustomerId, setCurrentCustomerId] = useState<string | null>(
    selectedCustomerId,
  );
  const [customerSearchSuspended, setCustomerSearchSuspended] = useState(
    Boolean(selectedCustomerId),
  );
  const [duplicateMatches, setDuplicateMatches] = useState<VehicleDuplicateMatch[]>([]);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  useEffect(() => {
    setCurrentCustomerId(selectedCustomerId);
    setCustomerSearchSuspended(Boolean(selectedCustomerId));
  }, [selectedCustomerId]);

  const safeSetCustomer = useCallback(
    (field: keyof CustomerInfo, value: string | null | undefined) => {
      onCustomerChange(field, value ?? null);
    },
    [onCustomerChange],
  );

  const safeSetVehicle = useCallback(
    (field: keyof VehicleInfo, value: string | null | undefined) => {
      const nextValue = field === "vin" ? normalizeVinInput(value).vin || null : value ?? null;
      onVehicleChange(field, nextValue);
    },
    [onVehicleChange],
  );

  useEffect(() => {
    const vin = vehicle.vin?.trim();
    const plate = vehicle.license_plate?.trim();
    const unit = vehicle.unit_number?.trim();

    if (!shopId || (!vin && !plate && !unit)) {
      setDuplicateMatches([]);
      setDuplicateWarning(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const result = await checkVehicleDuplicates({
          vin,
          licensePlate: plate,
          unitNumber: unit,
          customerId: currentCustomerId,
          vehicleId: selectedVehicleId,
        });
        if (cancelled) return;
        setDuplicateMatches(result.matches);
        const differentCustomerVin = result.matches.find(
          (match) => match.match_type === "vin" && match.same_customer === false,
        );
        if (differentCustomerVin) {
          setDuplicateWarning("This VIN is already assigned to another customer. Contact shop/admin to move vehicle.");
        } else if (result.matches.some((match) => match.same_customer === true)) {
          setDuplicateWarning("Vehicle already exists. Use existing vehicle instead of creating a duplicate.");
        } else {
          setDuplicateWarning(null);
        }
      } catch {
        if (!cancelled) {
          setDuplicateMatches([]);
          setDuplicateWarning(null);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [currentCustomerId, selectedVehicleId, shopId, vehicle.license_plate, vehicle.unit_number, vehicle.vin]);

  const applyPickedVehicle = useCallback(
    (picked: VehicleRow) => {
      const fields = hydrateVehicleFields(picked);
      safeSetVehicle("vin", fields.vin);
      safeSetVehicle("year", fields.year);
      safeSetVehicle("make", fields.make);
      safeSetVehicle("model", fields.model);
      safeSetVehicle("license_plate", fields.license_plate);
      safeSetVehicle("mileage", fields.mileage);
      safeSetVehicle("unit_number", fields.unit_number ?? null);
      safeSetVehicle("color", fields.color);
      safeSetVehicle("engine_hours", fields.engine_hours ?? null);
      safeSetVehicle("engine", fields.engine ?? null);
      safeSetVehicle("submodel", fields.submodel ?? null);
      safeSetVehicle("engine_family", fields.engine_family ?? null);
      safeSetVehicle("engine_type", fields.engine_type ?? null);
      safeSetVehicle("transmission", fields.transmission ?? null);
      safeSetVehicle("transmission_type", fields.transmission_type ?? null);
      safeSetVehicle("fuel_type", fields.fuel_type ?? null);
      safeSetVehicle("drivetrain", fields.drivetrain ?? null);
      onVehicleSelected?.(picked.id);
    },
    [onVehicleSelected, safeSetVehicle],
  );

  async function handlePickedCustomer(
    c: CustomerRow,
    pickedVehicle: VehicleRow | null = null,
  ) {
    setCustomerSearchSuspended(true);

    const applyCustomer = (picked: CustomerRow) => {
      const fields = hydrateCustomerFields(picked);
      safeSetCustomer("business_name", fields.business_name ?? null);
      safeSetCustomer("name", fields.name ?? null);
      safeSetCustomer("first_name", fields.first_name ?? null);
      safeSetCustomer("last_name", fields.last_name ?? null);
      safeSetCustomer("phone", fields.phone ?? null);
      safeSetCustomer("email", fields.email ?? null);
      safeSetCustomer("address", fields.address ?? null);
      safeSetCustomer("city", fields.city ?? null);
      safeSetCustomer("province", fields.province ?? null);
      safeSetCustomer("postal_code", fields.postal_code ?? null);
    };

    applyCustomer(c);

    try {
      const query = supabase
        .from("customers")
        .select("*")
        .eq("id", c.id);
      const { data } = shopId
        ? await query.eq("shop_id", shopId).maybeSingle()
        : await query.maybeSingle();

      if (data) applyCustomer(data as CustomerRow);
    } catch {
      /* Keep the fields already returned by autocomplete. */
    }

    onCustomerSelected?.(c.id);
    setCurrentCustomerId(c.id);

    if (pickedVehicle) {
      applyPickedVehicle(pickedVehicle);
      return;
    }

    // Preserve the existing customer-page and URL-prefill behavior: a customer
    // with exactly one vehicle can still be selected without a vehicle choice.
    try {
      const { data: vehs } = await supabase
        .from("vehicles")
        .select(
          "id, vin, year, make, model, license_plate, mileage, unit_number, color, engine_hours, engine, submodel, engine_family, engine_type, transmission, transmission_type, fuel_type, drivetrain, customer_id, created_at",
        )
        .eq("customer_id", c.id)
        .eq("shop_id", shopId)
        .order("created_at", { ascending: false })
        .limit(2);

      const arr = (vehs ?? []) as VehicleRow[];
      if (arr.length === 1) applyPickedVehicle(arr[0]);
    } catch {
      /* ignore */
    }
  }

  async function handlePickedVehicle(v: VehicleRow) {
    if (v.customer_id && shopId) {
      try {
        const { data: owner } = await supabase
          .from("customers")
          .select(
            "id, business_name, first_name, last_name, name, phone, phone_number, email, address, city, province, postal_code, created_at",
          )
          .eq("id", v.customer_id)
          .eq("shop_id", shopId)
          .maybeSingle();

        if (owner) {
          await handlePickedCustomer(owner as CustomerRow, v);
          return;
        }
      } catch {
        /* Fall through and at least apply the vehicle. */
      }
    }

    applyPickedVehicle(v);
  }

  const handleSaveClick = async () => {
    try {
      const differentCustomerVin = duplicateMatches.find(
        (match) => match.match_type === "vin" && match.same_customer === false,
      );
      if (differentCustomerVin) {
        throw new Error("This VIN is already assigned to another customer. Contact shop/admin to move vehicle.");
      }

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

  const panelClass =
    "rounded-2xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-panel-bg-soft)] shadow-[var(--theme-shadow-medium)] backdrop-blur-xl";
  const chipClass =
    "rounded-full border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-1 text-[11px] text-[color:var(--theme-text-muted)]";
  const labelClass = "text-xs text-[color:var(--theme-text-secondary)]";

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-6 text-[color:var(--theme-text-primary)]">
      {/* Header card */}
      <section className={`${panelClass} px-4 py-4`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-blackops tracking-[0.16em] text-[var(--accent-copper-light)]">
              Customer &amp; Vehicle
            </h1>
            <p className="mt-1 text-[0.75rem] text-[color:var(--theme-text-muted)]">
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
              <span className={`${chipClass} font-mono`}>
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
        <section className={`${panelClass} space-y-4 px-4 py-4 sm:px-6 sm:py-6`}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[color:var(--theme-text-primary)] sm:text-base">
              Customer Info
            </h2>
            <span className="text-[11px] text-[color:var(--theme-text-muted)]">
              Start typing to search existing customers in this shop.
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Business name + autocomplete */}
            <div className="sm:col-span-2 space-y-1">
              <label className={labelClass}>
                Business name <span className="text-[color:var(--theme-text-muted)]">(optional)</span>
              </label>
              <input
                className="input"
                placeholder="Business name"
                value={customer.business_name ?? ""}
                onChange={(e) => {
                  setCustomerSearchSuspended(false);
                  safeSetCustomer("business_name", e.target.value || null);
                }}
              />
              <CustomerAutocomplete
                q={customer.business_name ?? ""}
                shopId={shopId}
                suspended={customerSearchSuspended}
                onPick={({ customer: pickedCustomer, vehicle: pickedVehicle }) => {
                  void handlePickedCustomer(pickedCustomer, pickedVehicle);
                }}
              />
            </div>

            {/* First name */}
            <div className="space-y-1">
              <label className={labelClass}>First name</label>
              <input
                className="input"
                placeholder="First name"
                value={customer.first_name ?? ""}
                onChange={(e) => {
                  setCustomerSearchSuspended(false);
                  safeSetCustomer("first_name", e.target.value || null);
                }}
              />
              <CustomerAutocomplete
                q={customer.first_name ?? ""}
                shopId={shopId}
                suspended={customerSearchSuspended}
                onPick={({ customer: pickedCustomer, vehicle: pickedVehicle }) => {
                  void handlePickedCustomer(pickedCustomer, pickedVehicle);
                }}
              />
            </div>

            {/* Last name */}
            <div className="space-y-1">
              <label className={labelClass}>Last name</label>
              <input
                className="input"
                placeholder="Last name"
                value={customer.last_name ?? ""}
                onChange={(e) => {
                  setCustomerSearchSuspended(false);
                  safeSetCustomer("last_name", e.target.value || null);
                }}
              />
              <CustomerAutocomplete
                q={customer.last_name ?? ""}
                shopId={shopId}
                suspended={customerSearchSuspended}
                onPick={({ customer: pickedCustomer, vehicle: pickedVehicle }) => {
                  void handlePickedCustomer(pickedCustomer, pickedVehicle);
                }}
              />
            </div>

            {/* Phone */}
            <div className="space-y-1">
              <label className={labelClass}>Phone</label>
              <input
                className="input"
                placeholder="Phone"
                value={customer.phone ?? ""}
                onChange={(e) => {
                  setCustomerSearchSuspended(false);
                  safeSetCustomer("phone", e.target.value || null);
                }}
              />
              <CustomerAutocomplete
                q={customer.phone ?? ""}
                shopId={shopId}
                suspended={customerSearchSuspended}
                onPick={({ customer: pickedCustomer, vehicle: pickedVehicle }) => {
                  void handlePickedCustomer(pickedCustomer, pickedVehicle);
                }}
              />
            </div>

            {/* Email */}
            <div className="space-y-1">
              <label className={labelClass}>Email</label>
              <input
                type="email"
                className="input"
                placeholder="Email"
                value={customer.email ?? ""}
                onChange={(e) => {
                  setCustomerSearchSuspended(false);
                  safeSetCustomer("email", e.target.value || null);
                }}
              />
              <CustomerAutocomplete
                q={customer.email ?? ""}
                shopId={shopId}
                suspended={customerSearchSuspended}
                onPick={({ customer: pickedCustomer, vehicle: pickedVehicle }) => {
                  void handlePickedCustomer(pickedCustomer, pickedVehicle);
                }}
              />
            </div>

            {/* Address */}
            <div className="sm:col-span-2 space-y-1">
              <label className={labelClass}>Address</label>
              <input
                className="input"
                placeholder="Street address"
                value={customer.address ?? ""}
                onChange={(e) => safeSetCustomer("address", e.target.value || null)}
              />
            </div>

            {/* City */}
            <div className="space-y-1">
              <label className={labelClass}>City</label>
              <input
                className="input"
                placeholder="City"
                value={customer.city ?? ""}
                onChange={(e) => safeSetCustomer("city", e.target.value || null)}
              />
            </div>

            {/* Province */}
            <div className="space-y-1">
              <label className={labelClass}>Province</label>
              <input
                className="input"
                placeholder="Province / State"
                value={customer.province ?? ""}
                onChange={(e) => safeSetCustomer("province", e.target.value || null)}
              />
            </div>

            {/* Postal code */}
            <div className="space-y-1">
              <label className={labelClass}>Postal code</label>
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
        <section className={`${panelClass} space-y-4 px-4 py-4 sm:px-6 sm:py-6`}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[color:var(--theme-text-primary)] sm:text-base">
              Vehicle Info
            </h2>
            <span className="text-[11px] text-[color:var(--theme-text-muted)]">
              Use unit # or plate to pull an existing vehicle for this customer.
            </span>
          </div>

          {duplicateWarning && (
            <div className="rounded-xl border border-amber-400/40 bg-amber-950/30 px-3 py-2 text-xs text-amber-100">
              <div className="font-semibold">Vehicle already exists</div>
              <div className="mt-1">{duplicateWarning}</div>
              {duplicateMatches.length > 0 && (
                <div className="mt-2 space-y-1">
                  {duplicateMatches.slice(0, 3).map((match) => (
                    <button
                      key={match.id}
                      type="button"
                      className="block text-left text-[11px] text-amber-50 underline decoration-amber-300/50 underline-offset-2"
                      onClick={() => onVehicleSelected?.(match.id)}
                    >
                      Use existing vehicle: {[match.year, match.make, match.model].filter(Boolean).join(" ") || match.vin || match.license_plate || match.unit_number || match.id}
                      {match.customer_display_name ? ` · ${match.customer_display_name}` : ""}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Unit # + autocomplete */}
            <div className="space-y-1">
              <label className={labelClass}>Unit #</label>
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
                onPick={(v) => {
                  void handlePickedVehicle(v);
                }}
              />
            </div>

            {/* Year */}
            <div className="space-y-1">
              <label className={labelClass}>Year</label>
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
              <label className={labelClass}>Make</label>
              <input
                className="input"
                placeholder="Make"
                value={vehicle.make ?? ""}
                onChange={(e) => safeSetVehicle("make", e.target.value || null)}
              />
            </div>

            {/* Model */}
            <div className="space-y-1">
              <label className={labelClass}>Model</label>
              <input
                className="input"
                placeholder="Model"
                value={vehicle.model ?? ""}
                onChange={(e) => safeSetVehicle("model", e.target.value || null)}
              />
            </div>

            {/* VIN */}
            <div className="space-y-1">
              <label className={labelClass}>VIN</label>
              <input
                className="input"
                placeholder="VIN"
                value={vehicle.vin ?? ""}
                onChange={(e) => safeSetVehicle("vin", e.target.value || null)}
              />
            </div>

            {/* Plate */}
            <div className="space-y-1">
              <label className={labelClass}>License plate</label>
              <input
                className="input"
                placeholder="License plate"
                value={vehicle.license_plate ?? ""}
                onChange={(e) =>
                  safeSetVehicle("license_plate", e.target.value || null)
                }
              />
              <UnitNumberAutocomplete
                q={vehicle.license_plate ?? ""}
                shopId={shopId}
                onPick={(v) => {
                  void handlePickedVehicle(v);
                }}
              />
            </div>

            {/* Mileage */}
            <div className="space-y-1">
              <label className={labelClass}>Mileage</label>
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
              <label className={labelClass}>Color</label>
              <input
                className="input"
                placeholder="Color"
                value={vehicle.color ?? ""}
                onChange={(e) => safeSetVehicle("color", e.target.value || null)}
              />
            </div>

            {/* Engine hours */}
            <div className="space-y-1">
              <label className={labelClass}>Engine hours</label>
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
              <label className={labelClass}>Engine / Trim</label>
              <input
                className="input"
                placeholder="e.g. 3.5L EcoBoost"
                value={vehicle.engine ?? ""}
                onChange={(e) => safeSetVehicle("engine", e.target.value || null)}
              />
            </div>

            {/* Transmission */}
            <div className="space-y-1">
              <label className={labelClass}>Transmission</label>
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
              <label className={labelClass}>Fuel type</label>
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
                <option value="electric">Electric (BEV)</option>
                <option value="ev">Electric (legacy)</option>
                <option value="other">Other</option>
              </select>
            </div>

            {/* Drivetrain */}
            <div className="space-y-1">
              <label className={labelClass}>Drivetrain</label>
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
                px-4 py-2 text-sm font-semibold text-[color:var(--theme-text-on-accent)]
                shadow-[var(--theme-shadow-medium)]
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
                border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)]
                px-3 py-1.5 text-xs sm:text-sm text-[color:var(--theme-text-secondary)]
                transition hover:border-red-400/60 hover:bg-red-950/35 hover:text-red-200
              "
              title="Clear Customer & Vehicle fields (does not delete an existing Work Order)"
            >
              Clear
            </button>
          )}

          {workOrderExists ? (
            <span className="text-xs text-[color:var(--theme-text-muted)]">
              Work order already exists — you can add lines now.
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}
