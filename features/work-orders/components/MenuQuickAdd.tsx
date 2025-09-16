// features/work-orders/components/MenuQuickAdd.tsx
"use client";

import { useMemo, useState } from "react";
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
  estLaborHours: number; // displayed on the card
  items: PackageItem[];  // inserted as separate work_order_lines
};

function useMenuData() {
  // quick single services (existing style)
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

  // packages (NEW)
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

export function MenuQuickAdd({ workOrderId }: { workOrderId: string }) {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const { singles, packages } = useMenuData();

  const [addingId, setAddingId] = useState<string | null>(null);

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

    // Let the parent page refresh itself
    window.dispatchEvent(new CustomEvent("wo:line-added"));
  }

  async function addPackage(pkg: PackageDef) {
    setAddingId(pkg.id);

    // Build a batch of lines (one per item)
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
      {/* PACKAGES */}
      <div>
        <h3 className="font-semibold text-orange-400 mb-2">Packages</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {packages.map((p) => (
            <button
              key={p.id}
              onClick={() => addPackage(p)}
              disabled={addingId === p.id}
              className="text-left border border-neutral-800 bg-neutral-950 hover:bg-neutral-900 rounded p-3 disabled:opacity-60"
              title={p.summary}
            >
              <div className="font-medium">{p.name}</div>
              <div className="text-xs text-neutral-400">
                {p.jobType} • ~{p.estLaborHours.toFixed(1)}h
              </div>
              <div className="text-xs text-neutral-500 mt-1 line-clamp-2">
                {p.summary}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* SINGLE SERVICES */}
      <div>
        <h3 className="font-semibold text-orange-400 mb-2">Quick add from menu</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {singles.map((m) => (
            <button
              key={m.name}
              onClick={() => addSingle(m)}
              disabled={addingId === m.name}
              className="text-left border border-neutral-800 bg-neutral-950 hover:bg-neutral-900 rounded p-3 disabled:opacity-60"
            >
              <div className="font-medium">{m.name}</div>
              <div className="text-xs text-neutral-400">
                {m.jobType} • {m.laborHours.toFixed(1)}h
                {m.partCost ? ` • ~$${m.partCost.toFixed(0)} parts` : ""}
              </div>
              {m.notes ? (
                <div className="text-xs text-neutral-500 mt-1">{m.notes}</div>
              ) : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}