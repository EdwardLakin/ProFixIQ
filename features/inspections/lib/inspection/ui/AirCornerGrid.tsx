"use client";

import { useMemo } from "react";
import { useInspectionForm } from "@inspections/lib/inspection/ui/InspectionFormContext";
import type { InspectionItem } from "@inspections/lib/inspection/types";

type Props = {
  sectionIndex: number;
  items: InspectionItem[];
  /** Optional hint used when a row/unit is blank */
  unitHint?: (label: string) => string;
};

/**
 * Panelized grid for AIR axles.
 * Groups items by axle label (e.g., "Steer 1", "Drive 2") and renders a compact
 * Left/Right input row for each metric inside that axle’s card.
 *
 * It expects item labels of the form:
 *   "<AXLE> Left <METRIC>"
 *   "<AXLE> Right <METRIC>"
 *   (e.g., "Steer 1 Left Tread Depth")
 */
export default function AirCornerGrid({ sectionIndex, items, unitHint }: Props) {
  const { updateItem } = useInspectionForm();

  type Side = "Left" | "Right";
  const labelRe = /^(?<axle>.+?)\s+(?<side>Left|Right)\s+(?<metric>.+)$/i;

  type Row = {
    metric: string;
    unit?: string | null;
    leftIdx?: number;
    rightIdx?: number;
    leftVal?: string | number | null;
    rightVal?: string | number | null;
  };

  type AxleGroup = {
    axle: string;
    rows: Row[];
  };

  const groups: AxleGroup[] = useMemo(() => {
    const byAxle = new Map<string, Map<string, Row>>();

    items.forEach((it, idx) => {
      const label = it.item ?? "";
      const m = label.match(labelRe);
      if (!m?.groups) return;

      const axle = m.groups.axle.trim();
      const side = m.groups.side as Side;
      const metric = m.groups.metric.trim();

      const axleMap = byAxle.get(axle) ?? new Map<string, Row>();
      const existing = axleMap.get(metric) ?? { metric };

      if (side === "Left") {
        existing.leftIdx = idx;
        existing.leftVal = it.value ?? "";
      } else {
        existing.rightIdx = idx;
        existing.rightVal = it.value ?? "";
      }

      // Prefer an explicit unit on the item; else ask unitHint
      existing.unit = it.unit ?? (unitHint ? unitHint(label) : it.unit ?? "");

      axleMap.set(metric, existing);
      byAxle.set(axle, axleMap);
    });

    // Convert map structure to a stable array for rendering
    return Array.from(byAxle.entries()).map(([axle, rowsMap]) => ({
      axle,
      rows: Array.from(rowsMap.values()),
    }));
  }, [items, unitHint]);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {groups.map((group) => (
        <div
          key={group.axle}
          className="rounded-lg border border-zinc-800 bg-zinc-900 p-3"
        >
          <div className="mb-2 font-semibold text-orange-400">{group.axle}</div>

          <div className="space-y-3">
            {group.rows.map((row) => (
              <div key={row.metric} className="rounded bg-zinc-950/70 p-3">
                <div className="mb-2 text-sm font-semibold text-orange-300">
                  {row.metric}
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-zinc-400">Left</label>
                    <input
                      className="w-full rounded border border-zinc-800 bg-zinc-800/60 px-2 py-1 text-white"
                      value={String(row.leftVal ?? "")}
                      onChange={(e) => {
                        if (row.leftIdx != null) {
                          updateItem(sectionIndex, row.leftIdx, { value: e.target.value });
                        }
                      }}
                      placeholder="Value"
                    />
                  </div>

                  <div className="text-center text-xs text-zinc-400">
                    {row.unit ??
                      (unitHint
                        ? unitHint(`${group.axle} Left ${row.metric}`)
                        : "")}
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-zinc-400">Right</label>
                    <input
                      className="w-full rounded border border-zinc-800 bg-zinc-800/60 px-2 py-1 text-white"
                      value={String(row.rightVal ?? "")}
                      onChange={(e) => {
                        if (row.rightIdx != null) {
                          updateItem(sectionIndex, row.rightIdx, { value: e.target.value });
                        }
                      }}
                      placeholder="Value"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}