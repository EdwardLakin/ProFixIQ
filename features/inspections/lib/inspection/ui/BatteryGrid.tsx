// features/inspections/lib/inspection/ui/BatteryGrid.tsx
"use client";

import { useMemo, useRef, useState } from "react";
import { useInspectionForm } from "@inspections/lib/inspection/ui/InspectionFormContext";
import type { InspectionItem } from "@inspections/lib/inspection/types";

type Props = {
  sectionIndex: number;
  items: InspectionItem[];
  /** Optional unit resolver when an item has no unit */
  unitHint?: (label: string) => string;
};

type BatteryCell = {
  idx: number;
  battery: string; // e.g. "Battery 1"
  metric: string;  // e.g. "Voltage"
  unit: string;
  fullLabel: string;
  initial: string;
};

type BatteryRow = {
  metric: string;
  cells: BatteryCell[]; // ordered by battery index
};

const BATTERY_RE = /^(?<battery>Battery\s*\d+)\s+(?<metric>.+)$/i;

const metricOrder = [
  "Voltage",
  "CCA",
  "State of Health",
  "State of Charge",
  "Load Test",
  "Visual Condition",
];

const metricCompare = (a: string, b: string) => {
  const ai = metricOrder.findIndex((m) =>
    a.toLowerCase().includes(m.toLowerCase()),
  );
  const bi = metricOrder.findIndex((m) =>
    b.toLowerCase().includes(m.toLowerCase()),
  );
  const A = ai === -1 ? Number.MAX_SAFE_INTEGER : ai;
  const B = bi === -1 ? Number.MAX_SAFE_INTEGER : bi;
  if (A !== B) return A - B;
  return a.localeCompare(b);
};

const batteryIndex = (battery: string): number => {
  // "Battery 1" → 1, "Battery 2" → 2, etc.
  const m = battery.match(/battery\s*(\d+)/i);
  if (m?.[1]) {
    const n = Number(m[1]);
    if (Number.isFinite(n)) return n;
  }
  return Number.MAX_SAFE_INTEGER;
};

export default function BatteryGrid({ sectionIndex, items, unitHint }: Props) {
  const { updateItem } = useInspectionForm();

  const [open, setOpen] = useState(true);

  const [, setFilledMap] = useState<Record<number, boolean>>(() => {
    const m: Record<number, boolean> = {};
    items.forEach((it, i) => (m[i] = !!String(it.value ?? "").trim()));
    return m;
  });

  const commit = (idx: number, el: HTMLInputElement | null) => {
    if (!el) return;
    const value = el.value;
    updateItem(sectionIndex, idx, { value });
    const has = value.trim().length > 0;
    setFilledMap((prev) =>
      prev[idx] === has ? prev : { ...prev, [idx]: has },
    );
  };

  const grid = useMemo<{
    batteries: string[];
    rows: BatteryRow[];
  }>(() => {
    const allCells: BatteryCell[] = [];

    items.forEach((it, idx) => {
      const label = it.item ?? "";
      if (!label) return;

      const m = label.match(BATTERY_RE);
      if (!m?.groups) return;

      const battery = m.groups.battery.trim(); // e.g. "Battery 1"
      const metric = m.groups.metric.trim();   // e.g. "Voltage"

      const unit =
        (it.unit ?? "") || (unitHint ? unitHint(label) : "") || "";

      allCells.push({
        idx,
        battery,
        metric,
        unit,
        fullLabel: label,
        initial: String(it.value ?? ""),
      });
    });

    if (!allCells.length) return { batteries: [], rows: [] };

    const batteries = Array.from(
      new Set(allCells.map((c) => c.battery)),
    ).sort((a, b) => batteryIndex(a) - batteryIndex(b));

    const byMetric = new Map<string, BatteryRow>();

    for (const cell of allCells) {
      const key = cell.metric.toLowerCase();
      const existing = byMetric.get(key) || { metric: cell.metric, cells: [] };
      byMetric.set(key, {
        ...existing,
        metric: cell.metric,
        cells: [...existing.cells, cell],
      });
    }

    const rows = Array.from(byMetric.values())
      .map((row) => ({
        ...row,
        cells: [...row.cells].sort(
          (a, b) => batteryIndex(a.battery) - batteryIndex(b.battery),
        ),
      }))
      .sort((a, b) => metricCompare(a.metric, b.metric));

    return { batteries, rows };
  }, [items, unitHint]);

  const InputCell = ({
    idx,
    unit,
    defaultValue,
  }: {
    idx: number;
    unit: string;
    defaultValue: string;
  }) => {
    const spanRef = useRef<HTMLSpanElement | null>(null);

    return (
      <div className="relative w-full max-w-[9rem]">
        <input
          defaultValue={defaultValue}
          tabIndex={0}
          className="w-full rounded-lg border border-neutral-700 bg-neutral-900/80 px-3 py-1.5 pr-14 text-sm text-white placeholder:text-neutral-500 focus:border-orange-500 focus:ring-2 focus:ring-orange-500"
          placeholder="Value"
          autoComplete="off"
          inputMode="decimal"
          onBlur={(e) => commit(idx, e.currentTarget)}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
          }}
        />
        <span
          ref={spanRef}
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 whitespace-nowrap text-[11px] text-neutral-400"
        >
          {unit}
        </span>
      </div>
    );
  };

  if (!grid.rows.length) {
    // Fallback: nothing matched "Battery N ..." pattern — render nothing,
    // letting the parent fall back to regular SectionDisplay if needed.
    return null;
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-end gap-3 px-1">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white hover:border-accent hover:bg-white/10"
          aria-expanded={open}
          title={open ? "Collapse" : "Expand"}
          tabIndex={-1}
        >
          {open ? "Collapse" : "Expand"}
        </button>
      </div>

      <div className="overflow-x-auto">
        <div className="inline-block min-w-full align-middle">
          <div className="overflow-hidden rounded-2xl border border-white/8 bg-black/40 shadow-card backdrop-blur-md">
            <table className="min-w-full border-separate border-spacing-y-1">
              <thead>
                <tr className="text-xs text-neutral-400">
                  <th className="px-3 py-2 text-left text-[11px] font-normal uppercase tracking-[0.16em] text-neutral-500">
                    Metric
                  </th>
                  {grid.batteries.map((batt) => (
                    <th
                      key={batt}
                      className="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-300"
                      style={{
                        fontFamily: "Black Ops One, system-ui, sans-serif",
                      }}
                    >
                      {batt}
                    </th>
                  ))}
                </tr>
              </thead>
              {open && (
                <tbody>
                  {grid.rows.map((row, rowIdx) => (
                    <tr key={`${row.metric}-${rowIdx}`} className="align-middle">
                      <td className="px-3 py-2 text-sm font-semibold text-white">
                        {row.metric}
                      </td>
                      {grid.batteries.map((batt) => {
                        const cell = row.cells.find(
                          (c) => c.battery === batt,
                        );
                        if (!cell) {
                          return (
                            <td key={batt} className="px-3 py-2">
                              <div className="h-[34px]" />
                            </td>
                          );
                        }
                        return (
                          <td key={batt} className="px-3 py-2 text-center">
                            <InputCell
                              idx={cell.idx}
                              unit={cell.unit}
                              defaultValue={cell.initial}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              )}
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}