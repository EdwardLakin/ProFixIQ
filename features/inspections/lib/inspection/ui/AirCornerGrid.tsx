"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useInspectionForm } from "@inspections/lib/inspection/ui/InspectionFormContext";
import type { InspectionItem } from "@inspections/lib/inspection/types";

type Props = {
  sectionIndex: number;
  items: InspectionItem[];
  unitHint?: (label: string) => string;
  onAddAxle?: (axleLabel: string) => void;
};

export default function AirCornerGrid({ sectionIndex, items, unitHint, onAddAxle }: Props) {
  const { updateItem } = useInspectionForm();

  type Side = "Left" | "Right";
  const labelRe = /^(?<axle>.+?)\s+(?<side>Left|Right)\s+(?<metric>.+)$/i;

  type MetricCell = {
    metric: string;
    idx?: number;
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

  /* ---------------- local buffer with focused guard (no timers) ----------- */
  const [localVals, setLocalVals] = useState<Record<number, string>>({});
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null);

  useEffect(() => {
    setLocalVals((prev) => {
      const next = { ...prev };
      items.forEach((it, idx) => {
        if (focusedIdx === idx) return; // don't stomp active field
        const want = String(it.value ?? "");
        if (next[idx] !== want) next[idx] = want;
      });
      return next;
    });
  }, [items, focusedIdx]);

  const commitValue = (idx: number) => updateItem(sectionIndex, idx, { value: localVals[idx] ?? "" });

  /** --------------------- grid header summary + collapse ------------------- */
  const [open, setOpen] = useState(true);

  const filledCounts = useMemo(() => {
    return groups.map((g) => {
      const rows = [...g.left.rows, ...g.right.rows];
      const filled = rows.reduce(
        (a, r) => (r.idx != null && String(localVals[r.idx] ?? "").trim() ? a + 1 : a),
        0,
      );
      return { axle: g.axle, filled, total: rows.length };
    });
  }, [groups, localVals]);

  /** ----------------------------- Row (memo) ------------------------------- */
  const RowView = React.memo(function RowView({
    row,
    hint,
  }: {
    row: MetricCell;
    hint: (label: string) => string;
  }) {
    const idx = row.idx ?? -1;
    const id = idx >= 0 ? `air-cell-${idx}` : undefined;

    return (
      <div className="rounded bg-zinc-950/70 p-3">
        <div className="flex items-center gap-3">
          <label
            htmlFor={id}
            className="min-w-0 grow truncate text-sm font-semibold text-white"
            style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}
          >
            {row.metric}
          </label>

          <input
            id={id}
            name={id}
            className="w-40 rounded border border-gray-600 bg-black px-2 py-1 text-sm text-white outline-none placeholder:text-zinc-400"
            value={idx >= 0 ? localVals[idx] ?? "" : ""}
            onFocus={() => idx >= 0 && setFocusedIdx(idx)}
            onChange={(e) => {
              if (idx >= 0) {
                const v = e.target.value;
                setLocalVals((prev) => ({ ...prev, [idx]: v }));
              }
            }}
            onBlur={() => {
              if (idx >= 0) commitValue(idx);
              setFocusedIdx(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && idx >= 0) (e.currentTarget as HTMLInputElement).blur();
            }}
            placeholder="Value"
            autoComplete="off"
            inputMode="decimal"
            enterKeyHint="done"
          />
          <div className="text-right text-xs text-zinc-400">
            {row.unit ?? hint(row.fullLabel)}
          </div>
        </div>
      </div>
    );
  });

  const SideCardView = ({ side, rows }: { side: Side; rows: MetricCell[] }) => (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
      <div
        className="mb-2 font-semibold text-orange-400"
        style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}
      >
        {side}
      </div>

      {open && (
        <div className="space-y-3">
          {rows.map((row) =>
            row.idx != null ? (
              <RowView
                key={row.idx}                // ← stable, numeric key
                row={row}
                hint={(label) => (unitHint ? unitHint(label) : "")}
              />
            ) : (
              <div key={`${row.metric}-noidx`} className="rounded bg-zinc-950/70 p-3 opacity-70">
                <div className="text-sm font-semibold text-white">{row.metric}</div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-end gap-3 px-1">
        <div className="hidden text-xs text-zinc-400 md:block" style={{ fontFamily: "Roboto, system-ui, sans-serif" }}>
          {filledCounts.map((c, i) => (
            <span key={c.axle}>
              {c.axle} {c.filled}/{c.total}
              {i < filledCounts.length - 1 ? "  |  " : ""}
            </span>
          ))}
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded bg-zinc-700 px-2 py-1 text-xs text-white hover:bg-zinc-600"
          aria-expanded={open}
          title={open ? "Collapse" : "Expand"}
        >
          {open ? "Collapse" : "Expand"}
        </button>
      </div>

      {onAddAxle && <AddAxlePicker groups={groups} onAddAxle={onAddAxle} />}

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

/** Inline axle picker (unchanged) */
function AddAxlePicker({
  groups,
  onAddAxle,
}: {
  groups: { axle: string }[];
  onAddAxle: (axleLabel: string) => void;
}) {
  const existingAxles = useMemo(() => groups.map((g) => g.axle), [groups]);
  const [pendingAxle, setPendingAxle] = useState<string>("");

  const candidateAxles = useMemo(() => {
    const wants: string[] = [];
    for (let i = 1; i <= 2; i++) wants.push(`Steer ${i}`);
    for (let i = 1; i <= 4; i++) wants.push(`Drive ${i}`);
    wants.push("Tag", "Trailer 1", "Trailer 2", "Trailer 3");
    return wants.filter((l) => !existingAxles.includes(l));
  }, [existingAxles]);

  return (
    <div className="flex items-center gap-2">
      <select
        className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-sm text-white"
        value={pendingAxle}
        onChange={(e) => setPendingAxle(e.target.value)}
      >
        <option value="">Add axle…</option>
        {candidateAxles.map((l) => (
          <option key={l} value={l}>
            {l}
          </option>
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
  );
}