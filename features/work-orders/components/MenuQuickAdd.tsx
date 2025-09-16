// features/work-orders/components/MenuQuickAdd.tsx
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
    { name: "Air Filter", laborHours: 0.3, partCost: 25, jobType: "maintenance" },
    { name: "Coolant Flush", laborHours: 1.2, partCost: 80, jobType: "maintenance" },
    { name: "Battery Replacement", laborHours: 0.5, partCost: 120, jobType: "maintenance" },
    { name: "Tire Rotation", laborHours: 0.6, jobType: "maintenance" },
    { name: "Alignment", laborHours: 1.2, jobType: "maintenance" },
  ];

  const packages: PackageDef[] = [
    {
      id: "oil-gas",
      name: "Oil Change – Gasoline",
      jobType: "maintenance",
      estLaborHours: 0.8,
      summary:
        "Engine oil & filter, top off fluids, tire pressures, quick visual leak check.",
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
      summary:
        "Diesel engine oil & filter, drain fuel/water separator, DEF level, quick diesel-system checks.",
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
      summary:
        "Brakes, tires, suspension, fluids, leaks, battery test, lights, codes scan.",
      items: [
        { description: "Scan for diagnostic trouble codes (DTCs)", jobType: "diagnosis", laborHours: 0.2 },
        { description: "Brake system inspection (pads/rotors/hoses/fluid leaks)", jobType: "inspection", laborHours: 0.2 },
        { description: "Suspension/steering inspection (ball joints, tie rods, bushings)", jobType: "inspection", laborHours: 0.2 },
        { description: "Tires (tread depth, wear pattern) & set pressures", jobType: "inspection", laborHours: 0.1 },
        { description: "Battery test & charging system quick check", jobType: "inspection", laborHours: 0.1 },
        { description: "Fluids/leaks/hoses/belts visual inspection", jobType: "inspection", laborHours: 0.2 },
      ],
    },
    {
      id: "insp-diesel",
      name: "Multi-Point Inspection – Diesel",
      jobType: "inspection",
      estLaborHours: 1.2,
      summary:
        "All gas checks + diesel specifics: glow system, fuel system, turbo/charge air, DPF/regen, DEF.",
      items: [
        { description: "Scan for diagnostic trouble codes (powertrain & emissions)", jobType: "diagnosis", laborHours: 0.2 },
        { description: "Brake system inspection", jobType: "inspection", laborHours: 0.2 },
        { description: "Suspension/steering inspection", jobType: "inspection", laborHours: 0.2 },
        { description: "Tires (tread, wear) & set pressures", jobType: "inspection", laborHours: 0.1 },
        { description: "Battery & charging system quick test", jobType: "inspection", laborHours: 0.1 },
        { description: "Fuel system visual (lines, filter housing, leaks)", jobType: "inspection", laborHours: 0.1 },
        { description: "Glow plug system quick check (indicator, basic continuity if applicable)", jobType: "inspection", laborHours: 0.1 },
        { description: "Turbo/charge air hoses & intercooler connections", jobType: "inspection", laborHours: 0.1 },
        { description: "DPF/regen status & DEF system quick check", jobType: "inspection", laborHours: 0.2 },
      ],
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

  // Vehicle + customer prefill for inspection routes
  const [vehicle, setVehicle] = useState<VehicleLite | null>(null);
  const [customer, setCustomer] = useState<CustomerLite | null>(null);

  // For the Review Quote chip
  const [woLineCount, setWoLineCount] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      // Load work order links
      const { data: wo } = await supabase
        .from("work_orders")
        .select("id, vehicle_id, customer_id")
        .eq("id", workOrderId)
        .maybeSingle();

      // Vehicle
      if (wo?.vehicle_id) {
        const { data: v } = await supabase
          .from("vehicles")
          .select(
            "id, year, make, model, vin, license_plate, mileage, color, unit_number, odometer",
          )
          .eq("id", wo.vehicle_id)
          .maybeSingle();
        if (v) setVehicle(v as VehicleLite);
      }

      // Customer
      if (wo?.customer_id) {
        const { data: c } = await supabase
          .from("customers")
          .select(
            "id, first_name, last_name, phone, email, address, city, province, postal_code",
          )
          .eq("id", wo.customer_id)
          .maybeSingle();
        if (c) setCustomer(c as CustomerLite);
      }

      // Count current WO lines (simple signal something exists to review)
      const { count } = await supabase
        .from("work_order_lines")
        .select("*", { count: "exact", head: true })
        .eq("work_order_id", workOrderId);

      setWoLineCount(typeof count === "number" ? count : null);
    })();
  }, [supabase, workOrderId]);

  function pushInspection(path: string) {
    const params = new URLSearchParams();

    params.set("workOrderId", workOrderId);
    params.set(
      "template",
      path.includes("hydraulic")
        ? "Maintenance 50 (Hydraulic)"
        : "Maintenance 50 (Air Brake CVIP)",
    );

    if (customer) {
      if (customer.first_name) params.set("first_name", String(customer.first_name));
      if (customer.last_name) params.set("last_name", String(customer.last_name));
      if (customer.phone) params.set("phone", String(customer.phone));
      if (customer.email) params.set("email", String(customer.email));
      if (customer.address) params.set("address", String(customer.address));
      if (customer.city) params.set("city", String(customer.city));
      if (customer.province) params.set("province", String(customer.province));
      if (customer.postal_code) params.set("postal_code", String(customer.postal_code));
    }

    if (vehicle) {
      if (vehicle.year) params.set("year", String(vehicle.year));
      if (vehicle.make) params.set("make", String(vehicle.make));
      if (vehicle.model) params.set("model", String(vehicle.model));
      if (vehicle.vin) params.set("vin", String(vehicle.vin));
      if (vehicle.license_plate) params.set("license_plate", String(vehicle.license_plate));
      if (vehicle.mileage) params.set("mileage", String(vehicle.mileage));
      if (vehicle.color) params.set("color", String(vehicle.color));
      if (vehicle.unit_number) params.set("unit_number", String(vehicle.unit_number));
      if (vehicle.odometer) params.set("odometer", String(vehicle.odometer));
    }

    router.push(`${path}?${params.toString()}`);
  }

  async function addSingle(item: SimpleService) {
    setAddingId(item.name);

    const line: WorkOrderLineInsert = {
      work_order_id: workOrderId,
      description: item.name,
      labor_time: item.laborHours ?? null,
      status: "planned",
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

    const payload: WorkOrderLineInsert[] = pkg.items.map((i) => ({
      work_order_id: workOrderId,
      description: i.description,
      labor_time: typeof i.laborHours === "number" ? i.laborHours : null,
      status: "planned",
      priority: 3,
      job_type: (i.jobType ?? pkg.jobType) as WorkOrderLineInsert["job_type"],
      notes: i.notes ?? null,
    }));

    const { error } = await supabase.from("work_order_lines").insert(payload);
    setAddingId(null);

    if (error) {
      console.error("Failed to add package:", error);
      alert(error.message);
      return;
    }

    window.dispatchEvent(new CustomEvent("wo:line-added"));
  }

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
            onClick={() => pushInspection("/inspection/maintenance50-hydraulic")}
            className="rounded border border-neutral-800 bg-neutral-950 p-3 text-left hover:bg-neutral-900 disabled:opacity-60"
            disabled={!vehicle}
            title={!vehicle ? "Link a vehicle to this Work Order first." : "Open hydraulic inspection"}
          >
            <div className="font-medium">Maintenance 50 – Hydraulic</div>
            <div className="text-xs text-neutral-400">
              CVIP-style measurements + oil change section
            </div>
          </button>

          <button
            onClick={() => pushInspection("/inspection/maintenance50-air")}
            className="rounded border border-neutral-800 bg-neutral-950 p-3 text-left hover:bg-neutral-900 disabled:opacity-60"
            disabled={!vehicle}
            title={!vehicle ? "Link a vehicle to this Work Order first." : "Open air-brake inspection"}
          >
            <div className="font-medium">Maintenance 50 – Air (CVIP)</div>
            <div className="text-xs text-neutral-400">
              Air-governor, leakage, push-rod stroke + oil change
            </div>
          </button>
        </div>

        {!vehicle && (
          <p className="mt-2 text-xs text-neutral-500">
            No vehicle found on this work order — inspections need vehicle info to prefill the form.
          </p>
        )}
      </div>

      {/* PACKAGES */}
      <div>
        <h3 className="mb-2 font-semibold text-orange-400">Packages</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {packages.map((p) => (
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

      {/* SINGLE SERVICES */}
      <div>
        <h3 className="mb-2 font-semibold text-orange-400">Quick add from menu</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {singles.map((m) => (
            <button
              key={m.name}
              onClick={() => addSingle(m)}
              disabled={addingId === m.name}
              className="rounded border border-neutral-800 bg-neutral-950 p-3 text-left hover:bg-neutral-900 disabled:opacity-60"
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