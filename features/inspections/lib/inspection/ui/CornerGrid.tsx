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
 * AirCornerGrid
 * - Renders each AXLE as a header (e.g., "Steer 1", "Drive 1")
 * - Under each axle, shows **two cards**: Left and Right
 * - Each card contains all metrics (Tire Pressure, Tread Depth, Lining/Shoe, Drum/Rotor, Push Rod)
 * - Uses existing items (labels like "Steer 1 Left Tread Depth", etc.)
 */
export default function AirCornerGrid({ sectionIndex, items, unitHint }: Props) {
  const { updateItem } = useInspectionForm();

  type Side = "Left" | "Right";
  const labelRe = /^(?<axle>.+?)\s+(?<side>Left|Right)\s+(?<metric>.+)$/i;

  type MetricCell = {
    metric: string;
    idx?: number;
    val?: string | number | null;
    unit?: string | null;
    labelForHint: string; // full label for unitHint lookup
  };
  type SideCard = {
    side: Side;
    rows: MetricCell[];
  };
  type AxleGroup = { axle: string; left: SideCard; right: SideCard };

  const metricOrder = [
    "Tire Pressure",
    "Tread Depth",
    "Lining/Shoe Thickness",
    "Drum/Rotor Condition",
    "Push Rod Travel",
    "Wheel Torque Inner",
    "Wheel Torque Outer",
  ];

  const groups: AxleGroup[] = useMemo(() => {
    // Map: axle -> side -> metric -> cell
    const byAxle = new Map<
      string,
      { Left: Map<string, MetricCell>; Right: Map<string, MetricCell> }
    >();

    items.forEach((it, idx) => {
      const label = it.item ?? "";
      const m = label.match(labelRe);
      if (!m?.groups) return;

      const axle = m.groups.axle.trim();
      const side = m.groups.side as Side;
      const metric = m.groups.metric.trim();

      const bucket =
        byAxle.get(axle) ??
        { Left: new Map<string, MetricCell>(), Right: new Map<string, MetricCell>() };

      const map = bucket[side];
      const existing =
        map.get(metric) ??
        ({
          metric,
          labelForHint: label,
        } as MetricCell);

      existing.idx = idx;
      existing.val = it.value ?? "";
      // prefer item.unit; else unitHint
      existing.unit = it.unit ?? (unitHint ? unitHint(label) : "");

      map.set(metric, existing);
      byAxle.set(axle, bucket);
    });

    // Convert into stable arrays and sort by metricOrder
    const orderIndex = (m: string) => {
      const base = metricOrder.findIndex((x) =>
        m.toLowerCase().includes(x.toLowerCase()),
      );
      return base === -1 ? Number.MAX_SAFE_INTEGER : base;
    };

    return Array.from(byAxle.entries()).map(([axle, sides]) => {
      const leftRows = Array.from(sides.Left.values()).sort(
        (a, b) => orderIndex(a.metric) - orderIndex(b.metric),
      );
      const rightRows = Array.from(sides.Right.values()).sort(
        (a, b) => orderIndex(a.metric) - orderIndex(b.metric),
      );
      return {
        axle,
        left: { side: "Left", rows: leftRows },
        right: { side: "Right", rows: rightRows },
      };
    });
  }, [items, unitHint]);

  const Card = ({ side, rows }: { side: Side; rows: MetricCell[] }) => (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
      <div className="mb-2 font-semibold text-orange-400" style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}>
        {side}
      </div>

      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.metric} className="rounded bg-zinc-950/70 p-3">
            <div
              className="mb-2 text-sm font-semibold text-orange-300"
              style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}
            >
              {row.metric}
            </div>

            <div className="grid grid-cols-[1fr_auto] items-center gap-2">
              <input
                className="w-full rounded border border-zinc-800 bg-zinc-800/60 px-2 py-1 text-white"
                style={{ fontFamily: "Roboto, system-ui, sans-serif" }}
                value={String(row.val ?? "")}
                onChange={(e) => {
                  if (row.idx != null) {
                    updateItem(sectionIndex, row.idx, { value: e.target.value });
                  }
                }}
                placeholder="Value"
              />
              <div className="text-center text-xs text-zinc-400">
                {row.unit ??
                  (unitHint ? unitHint(row.labelForHint) : "")}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="grid gap-4">
      {groups.map((group) => (
        <div key={group.axle} className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
          {/* Axle header */}
          <div
            className="mb-3 text-lg font-semibold text-orange-400"
            style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}
          >
            {group.axle}
          </div>

          {/* Left / Right cards */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card side="Left" rows={group.left.rows} />
            <Card side="Right" rows={group.right.rows} />
          </div>
        </div>
      ))}
    </div>
  );
}