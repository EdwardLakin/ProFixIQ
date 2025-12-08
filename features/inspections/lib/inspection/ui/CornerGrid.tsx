// features/inspections/lib/inspection/ui/CornerGrid.tsx
"use client";

import { useMemo, useState } from "react";
import { useInspectionForm } from "@inspections/lib/inspection/ui/InspectionFormContext";
import type { InspectionItem } from "@inspections/lib/inspection/types";

type Props = {
  sectionIndex: number;
  items: InspectionItem[];
  unitHint?: (label: string) => string;
};

type Corner = "LF" | "RF" | "LR" | "RR";

type CornerCell = {
  idx: number;
  corner: Corner;
  metric: string;
  unit: string;
  fullLabel: string;
  initial: string;
};

type CornerRow = {
  metric: string;
  cells: CornerCell[];
};

const CORNER_RE = /^(?<corner>LF|RF|LR|RR)\s+(?<metric>.+)$/i;

const cornerOrder: Corner[] = ["LF", "RF", "LR", "RR"];

const metricOrder = [
  "Tire Pressure",
  "Tire Tread",
  "Brake Pad",
  "Rotor Condition",
  "Rotor Thickness",
  "Wheel Torque",
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

export default function CornerGrid({ sectionIndex, items, unitHint }: Props) {
  const { updateItem } = useInspectionForm();
  const [open, setOpen] = useState(true);

  const commit = (idx: number, el: HTMLInputElement | null) => {
    if (!el) return;
    const value = el.value;
    updateItem(sectionIndex, idx, { value });
  };

  const grid = useMemo<{
    corners: Corner[];
    rows: CornerRow[];
  }>(() => {
    const allCells: CornerCell[] = [];

    items.forEach((it, idx) => {
      const label = it.item ?? "";
      if (!label) return;

      const m = label.match(CORNER_RE);
      if (!m?.groups) return;

      const corner = m.groups.corner.trim().toUpperCase() as Corner;
      if (!cornerOrder.includes(corner)) return;

      const metric = m.groups.metric.trim();

      const unit =
        (it.unit ?? "") || (unitHint ? unitHint(label) : "") || "";

      allCells.push({
        idx,
        corner,
        metric,
        unit,
        fullLabel: label,
        initial: String(it.value ?? ""),
      });
    });

    if (!allCells.length) return { corners: [], rows: [] };

    const corners: Corner[] = cornerOrder.filter((c) =>
      allCells.some((cell) => cell.corner === c),
    );

    const byMetric = new Map<string, CornerRow>();

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
          (a, b) =>
            cornerOrder.indexOf(a.corner) - cornerOrder.indexOf(b.corner),
        ),
      }))
      .sort((a, b) => metricCompare(a.metric, b.metric));

    return { corners, rows };
  }, [items, unitHint]);

  const moveFocus = (
    sectionIdx: number,
    rowIndex: number,
    colIndex: number,
  ) => {
    const selector = `input[data-corner-section="${sectionIdx}"][data-row="${rowIndex}"][data-col="${colIndex}"]`;
    const el = document.querySelector<HTMLInputElement>(selector);
    if (el) el.focus();
  };

  if (!grid.rows.length) {
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
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/40 shadow-card backdrop-blur-md">
            <table className="min-w-full border-separate border-spacing-y-1">
              <thead>
                <tr className="text-xs text-neutral-400">
                  <th className="px-3 py-2 text-left text-[11px] font-normal uppercase tracking-[0.16em] text-neutral-500">
                    Metric
                  </th>
                  {grid.corners.map((corner) => (
                    <th
                      key={corner}
                      className="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-300"
                      style={{
                        fontFamily: "Black Ops One, system-ui, sans-serif",
                      }}
                    >
                      {corner}
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
                      {grid.corners.map((corner, colIdx) => {
                        const cell = row.cells.find(
                          (c) => c.corner === corner,
                        );
                        if (!cell) {
                          return (
                            <td key={corner} className="px-3 py-2">
                              <div className="h-[34px]" />
                            </td>
                          );
                        }
                        return (
                          <td key={corner} className="px-3 py-2 text-center">
                            <div className="relative w-full max-w-[9rem]">
                              <input
                                defaultValue={cell.initial}
                                tabIndex={0}
                                className="w-full rounded-lg border border-neutral-700 bg-neutral-950/80 px-3 py-1.5 pr-10 text-sm text-white placeholder:text-neutral-500 focus:border-accent focus:ring-2 focus:ring-accent/70"
                                placeholder="Value"
                                autoComplete="off"
                                inputMode="decimal"
                                data-corner-section={sectionIndex}
                                data-row={rowIdx}
                                data-col={colIdx}
                                onBlur={(e) =>
                                  commit(cell.idx, e.currentTarget)
                                }
                                onKeyDown={(e) => {
                                  const key = e.key;

                                  if (key === "Enter") {
                                    (e.currentTarget as HTMLInputElement).blur();
                                    return;
                                  }

                                  if (key === "ArrowRight") {
                                    e.preventDefault();
                                    moveFocus(sectionIndex, rowIdx, colIdx + 1);
                                  } else if (key === "ArrowLeft") {
                                    e.preventDefault();
                                    moveFocus(sectionIndex, rowIdx, colIdx - 1);
                                  } else if (key === "ArrowDown") {
                                    e.preventDefault();
                                    moveFocus(sectionIndex, rowIdx + 1, colIdx);
                                  } else if (key === "ArrowUp") {
                                    e.preventDefault();
                                    moveFocus(sectionIndex, rowIdx - 1, colIdx);
                                  }
                                }}
                              />
                              {cell.unit && (
                                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 whitespace-nowrap text-[11px] text-neutral-400">
                                  {cell.unit}
                                </span>
                              )}
                            </div>
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