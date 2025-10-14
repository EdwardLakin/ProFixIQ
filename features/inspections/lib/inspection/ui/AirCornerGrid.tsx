"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
    const i = metricOrder.findIndex((m) => metric.toLowerCase().includes(m.toLowerCase()));
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
        byAxle.get(axle) ?? { Left: new Map<string, MetricCell>(), Right: new Map<string, MetricCell>() };

      const map = bucket[side];
      const existing =
        map.get(metric) ??
        ({
          metric,
          fullLabel: label,
        } as MetricCell);

      existing.idx = idx;
      existing.val = it.value ?? "";
      // NOTE: we'll override pressure units below; unitHint remains for mm/in items.
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

  /* ---------------- Local buffered values + debounce (typing fix) ---------------- */
  const [localVals, setLocalVals] = useState<Record<number, string>>({});
  const timersRef = useRef<Record<number, number>>({});

  useEffect(() => {
    const seed: Record<number, string> = {};
    items.forEach((it, idx) => {
      seed[idx] = String(it.value ?? "");
    });
    setLocalVals(seed);
  }, [items]);

  const setBuffered = (idx: number, value: string) => {
    setLocalVals((prev) => ({ ...prev, [idx]: value }));
    if (timersRef.current[idx]) window.clearTimeout(timersRef.current[idx]);
    timersRef.current[idx] = window.setTimeout(() => {
      updateItem(sectionIndex, idx, { value });
      delete timersRef.current[idx];
    }, 250);
  };

  /* -------------------------- Pressure display controls --------------------------- */
  // PSI is the default. We keep input in PSI and (optionally) show tiny kPa.
  const [showKpa, setShowKpa] = useState<boolean>(true);
  const psiToKpa = (psi: number) => psi * 6.894757;

  const isPressure = (metric: string) => metric.toLowerCase().includes("pressure");

  const SideCardView = ({ side, rows }: { side: Side; rows: MetricCell[] }) => (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
      <div className="mb-2 font-semibold text-orange-400" style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}>
        {side}
      </div>

      <div className="space-y-3">
        {rows.map((row) => {
          const valStr = row.idx != null ? (localVals[row.idx] ?? "") : "";
          const valNum = Number(valStr);
          const showTinyKpa = showKpa && isPressure(row.metric) && !Number.isNaN(valNum) && valStr.trim() !== "";

        return (
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
                value={valStr}
                onChange={(e) => {
                  if (row.idx != null) setBuffered(row.idx, e.target.value);
                }}
                placeholder="Value"
                inputMode="decimal"
              />
              <div className="text-right text-xs text-zinc-400">
                {/* For pressure, hard-code PSI as primary, with optional tiny kPa. */}
                {isPressure(row.metric)
                  ? <>psi{showTinyKpa ? <> · {Math.round(psiToKpa(valNum))} kPa</> : null}</>
                  : (row.unit ?? (unitHint ? unitHint(row.fullLabel) : ""))}
              </div>
            </div>
          </div>
        );})}
      </div>
    </div>
  );

  return (
    <div className="grid gap-4">
      {/* Add Axle + Pressure display toggle */}
      <div className="flex items-center gap-3">
        {onAddAxle && (
          <AddAxleInline
            existingAxles={groups.map((g) => g.axle)}
            onAdd={onAddAxle}
          />
        )}
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs text-zinc-300">
          <input
            type="checkbox"
            className="h-3 w-3 accent-orange-500"
            checked={showKpa}
            onChange={(e) => setShowKpa(e.target.checked)}
          />
          Show kPa hint for pressures
        </label>
      </div>

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

/* unchanged helper for Add-Axle */
function AddAxleInline({
  existingAxles,
  onAdd,
}: {
  existingAxles: string[];
  onAdd: (axleLabel: string) => void;
}) {
  const [pending, setPending] = useState("");
  const wants: string[] = [];
  for (let i = 1; i <= 2; i++) wants.push(`Steer ${i}`);
  for (let i = 1; i <= 4; i++) wants.push(`Drive ${i}`);
  wants.push("Tag", "Trailer 1", "Trailer 2", "Trailer 3");
  const options = wants.filter((w) => !existingAxles.includes(w));

  return (
    <div className="flex items-center gap-2">
      <select
        className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-sm text-white"
        value={pending}
        onChange={(e) => setPending(e.target.value)}
      >
        <option value="">Add axle…</option>
        {options.map((l) => (
          <option key={l} value={l}>
            {l}
          </option>
        ))}
      </select>
      <button
        className="rounded bg-orange-600 px-3 py-1 text-sm font-semibold text-black hover:bg-orange-500 disabled:opacity-40"
        onClick={() => pending && onAdd(pending)}
        disabled={!pending}
      >
        + Add
      </button>
    </div>
  );
}