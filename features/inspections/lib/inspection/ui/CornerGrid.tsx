// features/inspections/lib/inspection/ui/CornerGrid.tsx
"use client";

import { useMemo, useState, useRef } from "react";
import { useInspectionForm } from "@inspections/lib/inspection/ui/InspectionFormContext";
import type { InspectionItem } from "@inspections/lib/inspection/types";

type Props = {
  sectionIndex: number;
  items: InspectionItem[];
  unitHint?: (label: string) => string;
  /** Optional: show CVIP spec for a full label like "LF Tire Tread". */
  onSpecHint?: (fullLabel: string) => void;
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

// 🔧 Order is now: pressure → tread → pad → rotor thickness → torque
const metricOrder = [
  "Tire Pressure",
  "Tire Tread",
  "Brake Pad",
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

export default function CornerGrid({
  sectionIndex,
  items,
  unitHint,
  onSpecHint,
}: Props) {
  const { updateItem } = useInspectionForm();
  const [open, setOpen] = useState(true);

  // 🔁 Focus scoped to this corner grid
  const rootRef = useRef<HTMLDivElement | null>(null);

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
    if (rowIndex < 0 || colIndex < 0) return;
    const root = rootRef.current ?? document;
    const selector = `input[data-corner-section="${sectionIdx}"][data-row="${rowIndex}"][data-col="${colIndex}"]`;
    const el = root.querySelector<HTMLInputElement>(selector);
    if (el) {
      el.focus();
      el.select?.();
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  };

  if (!grid.rows.length) {
    return null;
  }

  return (
    <div ref={rootRef} className="grid gap-3">
      <div className="flex items-center justify-end gap-3 px-1">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-full border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-neutral-100 shadow-[0_10px_24px_rgba(0,0,0,0.85)] hover:border-orange-500 hover:bg-black/80"
          aria-expanded={open}
          title={open ? "Collapse" : "Expand"}
          tabIndex={-1}
        >
          {open ? "Collapse" : "Expand"}
        </button>
      </div>

      <div className="overflow-x-auto">
        <div className="inline-block min-w-full align-middle">
          <div className="overflow-hidden rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/55 shadow-[0_18px_45px_rgba(0,0,0,0.9)] backdrop-blur-xl">
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
                        fontFamily:
                          "var(--font-blackops), system-ui, sans-serif",
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
                      <td className="px-3 py-2 text-sm font-semibold text-neutral-100">
                        <div className="flex items-center gap-2">
                          <span>{row.metric}</span>
                          {onSpecHint && (
                            <button
                              type="button"
                              tabIndex={-1}
                              onClick={() =>
                                // pass metric to spec hint (caller can map per section)
                                onSpecHint(row.metric)
                              }
                              className="rounded-full border border-orange-500/60 bg-orange-500/10 px-2 py-[2px] text-[9px] font-semibold uppercase tracking-[0.16em] text-orange-300 hover:bg-orange-500/20"
                              title="Show CVIP spec"
                            >
                              Spec
                            </button>
                          )}
                        </div>
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
                                className="w-full rounded-xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/80 px-3 py-1.5 pr-12 text-sm text-white placeholder:text-neutral-500 shadow-[0_10px_25px_rgba(0,0,0,0.85)] focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/80"
                                placeholder="Value"
                                autoComplete="off"
                                inputMode="decimal"
                                data-corner-grid="true"
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

                                  // Arrow keys: move in grid by row/col
                                  if (key === "ArrowRight") {
                                    e.preventDefault();
                                    moveFocus(sectionIndex, rowIdx, colIdx + 1);
                                    return;
                                  }
                                  if (key === "ArrowLeft") {
                                    e.preventDefault();
                                    moveFocus(sectionIndex, rowIdx, colIdx - 1);
                                    return;
                                  }
                                  if (key === "ArrowDown") {
                                    e.preventDefault();
                                    moveFocus(sectionIndex, rowIdx + 1, colIdx);
                                    return;
                                  }
                                  if (key === "ArrowUp") {
                                    e.preventDefault();
                                    moveFocus(sectionIndex, rowIdx - 1, colIdx);
                                    return;
                                  }

                                  // Tab: cycle within THIS corner grid (wrap around)
                                  if (key === "Tab") {
                                    const root = rootRef.current ?? document;
                                    const all = Array.from(
                                      root.querySelectorAll<HTMLInputElement>(
                                        'input[data-corner-grid="true"]',
                                      ),
                                    );

                                    if (!all.length) return;

                                    const current =
                                      e.currentTarget as HTMLInputElement;
                                    const index = all.indexOf(current);
                                    if (index === -1) return;

                                    const delta = e.shiftKey ? -1 : 1;
                                    let nextIndex = index + delta;

                                    if (nextIndex < 0)
                                      nextIndex = all.length - 1;
                                    if (nextIndex >= all.length)
                                      nextIndex = 0;

                                    e.preventDefault();
                                    e.stopPropagation();
                                    const target = all[nextIndex];
                                    target.focus();
                                    target.select?.();
                                    target.scrollIntoView({
                                      block: "nearest",
                                      inline: "nearest",
                                    });
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