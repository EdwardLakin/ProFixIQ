"use client";

import { useInspectionForm } from "@inspections/lib/inspection/ui/InspectionFormContext";
import type { InspectionItem } from "@inspections/lib/inspection/types";

type Props = {
  sectionIndex: number;
  items: InspectionItem[];
  unitHint?: (label: string) => string;
};

export default function AxlesCornerGrid({ sectionIndex, items, unitHint }: Props) {
  const { updateItem } = useInspectionForm();

  const r = /^(?<axle>.+?)\s+(?<side>Left|Right)\s+(?<metric>.+)$/i;

  type Row = {
    axle: string;
    metric: string;
    left?: string | number | null;
    right?: string | number | null;
    leftIdx?: number;
    rightIdx?: number;
    unit?: string | null;
  };

  const map = new Map<string, Row>();
  items.forEach((it, idx) => {
    const m = (it.item ?? "").match(r);
    if (!m?.groups) return;
    const axle = m.groups.axle.trim();
    const side = m.groups.side as "Left" | "Right";
    const metric = m.groups.metric.trim();
    const key = `${axle}::${metric}`;
    const row = map.get(key) ?? { axle, metric };
    if (side === "Left") {
      row.left = (it.value as any) ?? "";
      row.leftIdx = idx;
    } else {
      row.right = (it.value as any) ?? "";
      row.rightIdx = idx;
    }
    row.unit = it.unit || (unitHint ? unitHint(it.item || "") : "");
    map.set(key, row);
  });

  const rows = Array.from(map.values());

  return (
    <div className="space-y-3 rounded border border-zinc-700 bg-zinc-900 p-3">
      {rows.map((row, i) => (
        <div key={i} className="rounded bg-zinc-950/70 p-3">
          <div className="mb-2 text-sm font-semibold text-orange-300">
            {row.axle} — {row.metric}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-zinc-400">Left</label>
              <input
                className="w-full rounded border border-zinc-800 bg-zinc-800/60 px-2 py-1 text-white"
                value={String(row.left ?? "")}
                onChange={(e) =>
                  row.leftIdx != null && updateItem(sectionIndex, row.leftIdx, { value: e.target.value })
                }
                placeholder="Value"
              />
            </div>
            <div className="text-center text-xs text-zinc-400">
              {row.unit || (unitHint ? unitHint(`${row.axle} Left ${row.metric}`) : "")}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-zinc-400">Right</label>
              <input
                className="w-full rounded border border-zinc-800 bg-zinc-800/60 px-2 py-1 text-white"
                value={String(row.right ?? "")}
                onChange={(e) =>
                  row.rightIdx != null && updateItem(sectionIndex, row.rightIdx, { value: e.target.value })
                }
                placeholder="Value"
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}