//features/inspections/lib/inspection/menu/quick/diesel.tsx

"use client";

import { memo, useContext } from "react";
import { InspectionFormCtx } from "@inspections/lib/inspection/ui/InspectionFormContext";
import type {
  InspectionItem,
  InspectionItemStatus,
  InspectionSection,
} from "@inspections/lib/inspection/types";

// Give the context a type so TypeScript knows updateItem exists
type InspectionFormCtxType = {
  updateItem: (
    sectionIndex: number,
    itemIndex: number,
    changes: Partial<InspectionItem>
  ) => void;
} | null;

/** Build a single “basic quick inspection” section for DIESEL engines */
export function buildDieselQuickSection(): InspectionSection {
  const items: InspectionItem[] = [
    { item: "Engine Oil Level", value: "", unit: "", notes: "" },
    { item: "Coolant Level", value: "", unit: "", notes: "" },
    { item: "Power Steering Fluid Level", value: "", unit: "", notes: "" },
    { item: "Brake Fluid Level", value: "", unit: "", notes: "" },
    { item: "Windshield Washer Fluid Level", value: "", unit: "", notes: "" },
    { item: "Transmission Fluid Level (if applicable)", value: "", unit: "", notes: "" },
    { item: "DEF Level (if equipped)", value: "", unit: "", notes: "" },
    { item: "Fuel Water Separator (drain if needed)", value: "", unit: "", notes: "" },
    { item: "Engine Air Filter Condition", value: "", unit: "", notes: "" },
    { item: "Battery/Batteries State & Connections", value: "", unit: "", notes: "" },
    { item: "LF Tire Pressure", value: "", unit: "psi", notes: "" },
    { item: "RF Tire Pressure", value: "", unit: "psi", notes: "" },
    { item: "LR Tire Pressure", value: "", unit: "psi", notes: "" },
    { item: "RR Tire Pressure", value: "", unit: "psi", notes: "" },
    { item: "LF Tread Depth", value: "", unit: "mm", notes: "" },
    { item: "RF Tread Depth", value: "", unit: "mm", notes: "" },
    { item: "LR Tread Depth (Outer)", value: "", unit: "mm", notes: "" },
    { item: "LR Tread Depth (Inner)", value: "", unit: "mm", notes: "" },
    { item: "RR Tread Depth (Outer)", value: "", unit: "mm", notes: "" },
    { item: "RR Tread Depth (Inner)", value: "", unit: "mm", notes: "" },
    { item: "Horn Operation", value: "", unit: "", notes: "" },
    { item: "Wiper Blade Condition", value: "", unit: "", notes: "" },
    { item: "Washer Spray Operation", value: "", unit: "", notes: "" },
    { item: "Exterior Lights (HL/Turn/Brake/Reverse/Markers)", value: "", unit: "", notes: "" },
    { item: "Quick Inspection Notes", value: "", unit: "", notes: "" },
  ];

  return { title: "Basic Quick Inspection (Diesel)", items };
}

/** Two-column card layout with shared Notes, uses OK/FAIL/NA/RECOMMEND buttons */
export const QuickCheckDiesel = memo(function QuickCheckDiesel(props: {
  sectionIndex: number;
  items: InspectionItem[];
}) {
  const { sectionIndex, items } = props;

  const form = useContext(InspectionFormCtx) as InspectionFormCtxType;
  if (!form) {
    return <div className="text-red-400">Inspection form context not found</div>;
  }

  const { updateItem } = form;

  const buttons: InspectionItemStatus[] = ["ok", "fail", "na", "recommend"];
  const findIndex = (label: string): number =>
    items.findIndex((i) => (i.item ?? "") === label);
  const notesIdx = findIndex("Quick Inspection Notes");

  const cardRows = items
    .map((it, idx) => ({ it, idx }))
    .filter(({ it }) => (it.item ?? "") !== "Quick Inspection Notes");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {cardRows.map(({ it, idx }) => (
          <div key={idx} className="rounded border border-zinc-800 bg-zinc-900 p-3">
            <div className="mb-2 flex items-start justify-between gap-3">
              <h3 className="min-w-0 truncate text-sm font-medium text-white">{it.item}</h3>
              <div className="flex shrink-0 flex-wrap gap-1">
                {buttons.map((b) => (
                  <button
                    key={b}
                    onClick={() => updateItem(sectionIndex, idx, { status: b })}
                    className={
                      "rounded px-2 py-1 text-xs " +
                      ((it.status ?? "") === b
                        ? b === "ok"
                          ? "bg-green-600 text-white"
                          : b === "fail"
                          ? "bg-red-600 text-white"
                          : b === "na"
                          ? "bg-yellow-500 text-white"
                          : "bg-blue-500 text-white"
                        : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700")
                    }
                  >
                    {b.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-[1fr_84px] gap-2">
              <input
                className="w-full rounded border border-zinc-800 bg-zinc-800/60 px-2 py-1 text-white"
                value={String((it.value ?? "") as string)}
                onChange={(e) =>
                  updateItem(sectionIndex, idx, { value: e.target.value })
                }
                placeholder="value (e.g., filled, 32)"
              />
              <input
                className="w-full rounded border border-zinc-800 bg-zinc-800/60 px-2 py-1 text-white"
                value={String((it.unit ?? "") as string)}
                onChange={(e) =>
                  updateItem(sectionIndex, idx, { unit: e.target.value })
                }
                placeholder="unit"
              />
            </div>
          </div>
        ))}
      </div>

      {notesIdx >= 0 && (
        <div className="rounded border border-zinc-800 bg-zinc-900 p-3">
          <div className="mb-1 text-xs font-medium text-orange-400">Section Notes</div>
          <textarea
            className="h-24 w-full resize-y rounded border border-zinc-800 bg-zinc-800/60 px-2 py-1 text-white"
            value={String((items[notesIdx].notes ?? "") as string)}
            onChange={(e) =>
              updateItem(sectionIndex, notesIdx, { notes: e.target.value })
            }
            placeholder="Any recommendations or comments…"
          />
        </div>
      )}
    </div>
  );
});