"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database, TablesInsert } from "@shared/types/types/supabase";

type DB = Database;
type WorkOrderLineInsert = TablesInsert<"work_order_lines">;

type SimpleService = {
  name: string;
  laborHours: number;
  partCost?: number;
  jobType: "maintenance" | "repair" | "diagnosis" | "inspection";
  notes?: string;
};

type PackageItem = {
  description: string;
  jobType?: SimpleService["jobType"];
  laborHours?: number;
  notes?: string;
};

type PackageDef = {
  id: string;
  name: string;
  summary: string;
  jobType: "inspection" | "maintenance";
  estLaborHours: number;
  items: PackageItem[];
};

function useMenuData() {
  const singles: SimpleService[] = [
    { name: "Front Brakes", laborHours: 1.5, partCost: 120, jobType: "repair" },
    { name: "Rear Brakes", laborHours: 1.5, partCost: 110, jobType: "repair" },
    { name: "Brake Pads", laborHours: 1.2, partCost: 90, jobType: "repair" },
    { name: "Rotors", laborHours: 1.3, partCost: 140, jobType: "repair" },
    { name: "Oil Change (Gas)", laborHours: 0.8, partCost: 40, jobType: "maintenance" },
    { name: "Oil Change (Diesel)", laborHours: 1.2, partCost: 65, jobType: "maintenance", notes: "Higher capacity oil & filter" },
    { name: "Air Filter", laborHours: 0.3, partCost: 25, jobType: "maintenance" },
    { name: "Coolant Flush", laborHours: 1.2, partCost: 80, jobType: "maintenance" },
    { name: "Battery Replacement", laborHours: 0.5, partCost: 120, jobType: "maintenance" },
    { name: "Tire Rotation", laborHours: 0.6, jobType: "maintenance" },
    { name: "Alignment", laborHours: 1.2, jobType: "maintenance" },
    { name: "Quick Inspection – Gas", laborHours: 1.0, jobType: "inspection", notes: "Fluids, tires, lights, horn, wipers" },
    { name: "Quick Inspection – Diesel", laborHours: 1.2, jobType: "inspection", notes: "Fluids, tires, lights, horn, wipers, DEF check" },
  ];

  const packages: PackageDef[] = [
    {
      id: "oil-gas",
      name: "Oil Change – Gasoline",
      jobType: "maintenance",
      estLaborHours: 0.8,
      summary: "Engine oil & filter, top off fluids, tire pressures, quick visual leak check.",
      items: [
        { description: "Drain engine oil & replace oil filter", jobType: "maintenance", laborHours: 0.6 },
        { description: "Top off all fluids (coolant, washer, PS/ATF if applicable)", jobType: "maintenance", laborHours: 0.1 },
        { description: "Set tire pressures & reset maintenance light (if needed)", jobType: "maintenance", laborHours: 0.1 },
        { description: "Quick visual leak inspection (engine bay & undercarriage)", jobType: "inspection" },
      ],
    },
    {
      id: "oil-diesel",
      name: "Oil Change – Diesel",
      jobType: "maintenance",
      estLaborHours: 1.2,
      summary: "Diesel engine oil & filter, drain fuel/water separator, DEF level, quick diesel-system checks.",
      items: [
        { description: "Drain engine oil & replace oil filter", jobType: "maintenance", laborHours: 0.6 },
        { description: "Drain fuel water separator", jobType: "maintenance", laborHours: 0.2 },
        { description: "Check/Top DEF fluid level", jobType: "maintenance", laborHours: 0.1 },
        { description: "Inspect fuel filter condition (replace if due)", jobType: "maintenance", laborHours: 0.2, notes: "If replacement required, create additional line." },
        { description: "Quick diesel visual: charge pipes/turbo hoses/intercooler connections", jobType: "inspection" },
      ],
    },
    {
      id: "insp-gas",
      name: "Multi-Point Inspection – Gas",
      jobType: "inspection",
      estLaborHours: 1.0,
      summary: "Brakes, tires, suspension, fluids, leaks, battery test, lights, codes scan.",
      items: [],
    },
    {
      id: "insp-diesel",
      name: "Multi-Point Inspection – Diesel",
      jobType: "inspection",
      estLaborHours: 1.2,
      summary: "All gas checks + diesel specifics: glow system, fuel system, turbo/charge air, DPF/regen, DEF.",
      items: [],
    },
  ];

  return { singles, packages };
}

type VehicleLite = {
  year?: string | number | null;
  make?: string | null;
  model?: string | null;
  vin?: string | null;
  license_plate?: string | null;
  mileage?: string | number | null;
  color?: string | null;
  unit_number?: string | null;
  odometer?: string | number | null;
  id?: string | null;
};

type CustomerLite = {
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
  id?: string | null;
};

export function MenuQuickAdd({ workOrderId }: { workOrderId: string }) {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const router = useRouter();
  const { singles, packages } = useMenuData();

  const [addingId, setAddingId] = useState<string | null>(null);

  // Vehicle + customer prefill hints for UI
  const [vehicle, setVehicle] = useState<VehicleLite | null>(null);
  const [customer, setCustomer] = useState<CustomerLite | null>(null);

  // For the Review Quote chip
  const [woLineCount, setWoLineCount] = useState<number | null>(null);

  // Collapsing UI
  const [showAllPackages, setShowAllPackages] = useState(false);
  const [showAllSingles, setShowAllSingles] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: wo } = await supabase
        .from("work_orders")
        .select("id, vehicle_id, customer_id")
        .eq("id", workOrderId)
        .maybeSingle();

      if (wo?.vehicle_id) {
        const { data: v } = await supabase
          .from("vehicles")
          .select("id, year, make, model, vin, license_plate, mileage, color, unit_number, odometer")
          .eq("id", wo.vehicle_id)
          .maybeSingle();
        if (v) setVehicle(v as VehicleLite);
      } else {
        setVehicle(null);
      }

      if (wo?.customer_id) {
        const { data: c } = await supabase
          .from("customers")
          .select("id, first_name, last_name, phone, email, address, city, province, postal_code")
          .eq("id", wo.customer_id)
          .maybeSingle();
        if (c) setCustomer(c as CustomerLite);
      } else {
        setCustomer(null);
      }

      const { count } = await supabase
        .from("work_order_lines")
        .select("*", { count: "exact", head: true })
        .eq("work_order_id", workOrderId);

      setWoLineCount(typeof count === "number" ? count : null);
    })();
  }, [supabase, workOrderId]);

  /** Adds a single inspection line (no navigation). User then clicks it to open FocusedJob → Open Inspection. */
  async function addInspectionLine(kind: "hydraulic" | "air") {
    setAddingId(kind);

    const description =
      kind === "air"
        ? "Maintenance 50 – Air (CVIP) – Inspection"
        : "Maintenance 50 – Hydraulic – Inspection";

    const newLine: WorkOrderLineInsert = {
      work_order_id: workOrderId,
      description,
      job_type: "inspection",
      status: "awaiting",
      priority: 3,
      labor_time: null,
      notes: null,
    };

    const { error } = await supabase.from("work_order_lines").insert(newLine);
    setAddingId(null);

    if (error) {
      console.error("Failed to create inspection line:", error);
      alert(error.message);
      return;
    }

    // Let the id page refresh & user can click the new line to open FocusedJob
    window.dispatchEvent(new CustomEvent("wo:line-added"));
  }

  async function addSingle(item: SimpleService) {
    setAddingId(item.name);

    const line: WorkOrderLineInsert = {
      work_order_id: workOrderId,
      description: item.name,
      labor_time: item.laborHours ?? null,
      status: "awaiting",
      priority: 3,
      job_type: item.jobType,
      notes: item.notes ?? null,
    };

    const { error } = await supabase.from("work_order_lines").insert([line]);
    setAddingId(null);

    if (error) {
      console.error("Failed to add single service:", error);
      alert(error.message);
      return;
    }

    window.dispatchEvent(new CustomEvent("wo:line-added"));
  }

  async function addPackage(pkg: PackageDef) {
    setAddingId(pkg.id);

    // For inspection packages, create ONE inspection line (no navigation)
    if (pkg.jobType === "inspection") {
      if (pkg.id === "insp-diesel") {
        await addInspectionLine("air");
      } else {
        await addInspectionLine("hydraulic");
      }
      setAddingId(null);
      return;
    }

    // For maintenance packages, create ONE summary line
    const line: WorkOrderLineInsert = {
      work_order_id: workOrderId,
      description: pkg.name,
      labor_time: pkg.estLaborHours,
      status: "awaiting",
      priority: 3,
      job_type: "maintenance",
      notes: pkg.summary,
    };

    const { error } = await supabase.from("work_order_lines").insert(line);
    setAddingId(null);

    if (error) {
      console.error("Failed to add package:", error);
      alert(error.message);
      return;
    }

    window.dispatchEvent(new CustomEvent("wo:line-added"));
  }

  const visiblePackages = showAllPackages ? packages : packages.slice(0, 2);
  const visibleSingles = showAllSingles ? singles : singles.slice(0, 2);

  const vehicleName =
    vehicle ? `${vehicle.year ?? ""} ${vehicle.make ?? ""} ${vehicle.model ?? ""}`.trim() : "";
  const customerName =
    customer ? [customer.first_name ?? "", customer.last_name ?? ""].filter(Boolean).join(" ") : "";

  const inspectionBtnTitle = (kind: "hydraulic" | "air") => {
    const tpl = kind === "air" ? "Air (CVIP)" : "Hydraulic";
    const who = customerName ? ` for ${customerName}` : "";
    const what = vehicleName ? ` on ${vehicleName}` : "";
    const missing =
      !vehicle || !customer
        ? " — note: link vehicle & customer on the work order to prefill the inspection"
        : "";
    return `Add "Maintenance 50 – ${tpl} – Inspection"${who}${what}${missing}`;
  };

  return (
    <div className="space-y-6">
      {/* QUOTES */}
      <div>
        <h3 className="mb-2 font-semibold text-orange-400">Quotes</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            onClick={() => router.push(`/work-orders/${workOrderId}/quote-review`)}
            className="flex items-center justify-between rounded border border-neutral-800 bg-neutral-950 p-3 text-left hover:bg-neutral-900"
            title="Open quote review for this work order"
          >
            <div>
              <div className="font-medium">Review Quote</div>
              <div className="text-xs text-neutral-400">Approve/decline, edit, and send</div>
            </div>
            {typeof woLineCount === "number" && woLineCount > 0 && (
              <span className="ml-3 rounded-full bg-orange-500 px-2 py-0.5 text-xs font-semibold text-black">
                {woLineCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* INSPECTIONS */}
      <div>
        <h3 className="mb-2 font-semibold text-orange-400">Inspections</h3>

        <div className="grid gap-2 sm:grid-cols-2">
          <button
            onClick={() => addInspectionLine("hydraulic")}
            className="rounded border border-neutral-800 bg-neutral-950 p-3 text-left hover:bg-neutral-900"
            title={inspectionBtnTitle("hydraulic")}
            disabled={addingId === "hydraulic"}
          >
            <div className="font-medium">Maintenance 50 – Hydraulic</div>
            <div className="text-xs text-neutral-400">Measurements + oil change section</div>
            {(vehicleName || customerName) && (
              <div className="mt-1 text-[11px] text-neutral-500">
                {customerName ? `Customer: ${customerName}` : ""}
                {customerName && vehicleName ? " • " : ""}
                {vehicleName ? `Vehicle: ${vehicleName}` : ""}
              </div>
            )}
          </button>

          <button
            onClick={() => addInspectionLine("air")}
            className="rounded border border-neutral-800 bg-neutral-950 p-3 text-left hover:bg-neutral-900"
            title={inspectionBtnTitle("air")}
            disabled={addingId === "air"}
          >
            <div className="font-medium">Maintenance 50 – Air (CVIP)</div>
            <div className="text-xs text-neutral-400">Air-governor, leakage, push-rod stroke + oil change</div>
            {(vehicleName || customerName) && (
              <div className="mt-1 text-[11px] text-neutral-500">
                {customerName ? `Customer: ${customerName}` : ""}
                {customerName && vehicleName ? " • " : ""}
                {vehicleName ? `Vehicle: ${vehicleName}` : ""}
              </div>
            )}
          </button>
        </div>

        {!vehicle || !customer ? (
          <p className="mt-2 text-xs text-neutral-500">
            To prefill the inspection, make sure **both** vehicle and customer are linked on the work order.
          </p>
        ) : null}
      </div>

      {/* PACKAGES (collapsible) */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold text-orange-400">Packages</h3>
          <button
            className="text-xs text-neutral-300 hover:text-white underline"
            onClick={() => setShowAllPackages((v) => !v)}
          >
            {showAllPackages ? "Show less" : "Show more"}
          </button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {visiblePackages.map((p) => (
            <button
              key={p.id}
              onClick={() => addPackage(p)}
              disabled={addingId === p.id}
              className="rounded border border-neutral-800 bg-neutral-950 p-3 text-left hover:bg-neutral-900 disabled:opacity-60"
              title={p.summary}
            >
              <div className="font-medium">{p.name}</div>
              <div className="text-xs text-neutral-400">
                {p.jobType} • ~{p.estLaborHours.toFixed(1)}h
              </div>
              <div className="mt-1 line-clamp-2 text-xs text-neutral-500">{p.summary}</div>
            </button>
          ))}
        </div>
      </div>

      {/* SINGLE SERVICES (collapsible) */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold text-orange-400">Quick add from menu</h3>
          <button
            className="text-xs text-neutral-300 hover:text-white underline"
            onClick={() => setShowAllSingles((v) => !v)}
          >
            {showAllSingles ? "Show less" : "Show more"}
          </button>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {visibleSingles.map((m) => (
            <button
              key={m.name}
              onClick={() => addSingle(m)}
              disabled={addingId === m.name}
              className="rounded border border-neutral-800 bg-neutral-950 p-3 text-left hover:bg-neutral-900 disabled:opacity-60"
              title={
                customerName || vehicleName
                  ? `For ${customerName || "customer"}${vehicleName ? ` • ${vehicleName}` : ""}`
                  : undefined
              }
            >
              <div className="font-medium">{m.name}</div>
              <div className="text-xs text-neutral-400">
                {m.jobType} • {m.laborHours.toFixed(1)}h
                {m.partCost ? ` • ~$${m.partCost.toFixed(0)} parts` : ""}
              </div>
              {m.notes ? <div className="mt-1 text-xs text-neutral-500">{m.notes}</div> : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}