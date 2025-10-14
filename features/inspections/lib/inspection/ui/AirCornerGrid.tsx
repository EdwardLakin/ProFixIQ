"use client";

import { useMemo, useState } from "react";
import { useInspectionForm } from "@inspections/lib/inspection/ui/InspectionFormContext";
import type { InspectionItem } from "@inspections/lib/inspection/types";

type Props = {
  sectionIndex: number;
  items: InspectionItem[];
  unitHint?: (label: string) => string;
  /** Provide to enable the Add-Axle control */
  onAddAxle?: (axleLabel: string) => void;
};

export default function AirCornerGrid({ sectionIndex, items, unitHint, onAddAxle }: Props) {
  const { updateItem } = useInspectionForm();

  type Side = "Left" | "Right";
  const labelRe = /^(?<axle>.+?)\s+(?<side>Left|Right)\s+(?<metric>.+)$/i;

  type MetricCell = {
    metric: string;
    idx?: number;
    val?: string | number | null;
    unit?: string | null;
    fullLabel: string;
  };
  type SideCard = { side: Side; rows: MetricCell[] };
  type AxleGroup = { axle: string; left: SideCard; right: SideCard };

  const metricOrder = [
    "Tire Pressure",
    "Tread Depth",
    "Lining/Shoe",
    "Drum/Rotor",
    "Push Rod Travel",
    "Wheel Torque Inner",
    "Wheel Torque Outer",
  ];
  const orderIndex = (metric: string) => {
    const i = metricOrder.findIndex(m => metric.toLowerCase().includes(m.toLowerCase()));
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };

  const groups: AxleGroup[] = useMemo(() => {
    const byAxle = new Map<string, { Left: Map<string, MetricCell>; Right: Map<string, MetricCell> }>();

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
          fullLabel: label,
        } as MetricCell);

      existing.idx = idx;
      existing.val = it.value ?? "";
      existing.unit = it.unit ?? (unitHint ? unitHint(label) : "");
      map.set(metric, existing);
      byAxle.set(axle, bucket);
    });

    return Array.from(byAxle.entries()).map(([axle, sides]) => {
      const leftRows = Array.from(sides.Left.values()).sort((a, b) => orderIndex(a.metric) - orderIndex(b.metric));
      const rightRows = Array.from(sides.Right.values()).sort((a, b) => orderIndex(a.metric) - orderIndex(b.metric));
      return { axle, left: { side: "Left", rows: leftRows }, right: { side: "Right", rows: rightRows } };
    });
  }, [items, unitHint]);

  // Suggest next axle labels (max 2 steer, 4 drive)
  const existingAxles = useMemo(() => groups.map(g => g.axle), [groups]);
  const [pendingAxle, setPendingAxle] = useState<string>("");

  const candidateAxles = useMemo(() => {
    const wants: string[] = [];
    // steer 1..2
    for (let i = 1; i <= 2; i++) wants.push(`Steer ${i}`);
    // drive 1..4
    for (let i = 1; i <= 4; i++) wants.push(`Drive ${i}`);
    // tag/trailer as optional extras if you name them that way
    wants.push("Tag", "Trailer 1", "Trailer 2", "Trailer 3");

    return wants.filter(l => !existingAxles.includes(l));
  }, [existingAxles]);

  const SideCardView = ({ side, rows }: { side: Side; rows: MetricCell[] }) => (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
      <div
        className="mb-2 font-semibold text-orange-400"
        style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}
      >
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
                {row.unit ?? (unitHint ? unitHint(row.fullLabel) : "")}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="grid gap-4">
      {/* Add Axle control (only if handler provided) */}
      {onAddAxle && (
        <div className="flex items-center gap-2">
          <select
            className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-sm text-white"
            value={pendingAxle}
            onChange={(e) => setPendingAxle(e.target.value)}
          >
            <option value="">Add axle…</option>
            {candidateAxles.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
          <button
            className="rounded bg-orange-600 px-3 py-1 text-sm font-semibold text-black hover:bg-orange-500 disabled:opacity-40"
            onClick={() => pendingAxle && onAddAxle(pendingAxle)}
            disabled={!pendingAxle}
          >
            + Add
          </button>
        </div>
      )}

      {groups.map((group) => (
        <div key={group.axle} className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
          <div
            className="mb-3 text-lg font-semibold text-orange-400"
            style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}
          >
            {group.axle}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <SideCardView side="Left" rows={group.left.rows} />
            <SideCardView side="Right" rows={group.right.rows} />
          </div>
        </div>
      ))}
    </div>
  );
}