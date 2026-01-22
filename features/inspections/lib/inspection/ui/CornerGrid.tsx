// features/inspections/lib/inspection/ui/CornerGrid.tsx
"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
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

// ✅ Brakes-only ordering (tires removed)
const metricOrder = ["Brake Pad", "Rotor Thickness", "Wheel Torque"];

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

const isTireMetric = (metric: string) => {
  const m = metric.toLowerCase();
  // Remove any tire-related rows (pressure/tread/etc.)
  return m.includes("tire") || m.includes("tread") || m.includes("pressure");
};

export default function CornerGrid({
  sectionIndex,
  items,
  unitHint,
  onSpecHint,
}: Props) {
  const { updateItem } = useInspectionForm();
  const [open, setOpen] = useState(true);

  const commit = (idx: number, el: HTMLInputElement | null) => {
    if (!el) return;
    updateItem(sectionIndex, idx, { value: el.value });
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
      // ✅ Brakes-only: ignore tires here, keep everything else as-is
      if (isTireMetric(metric)) return;

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

  // ✅ Fix TAB behavior: keep focus cycling within the grid inputs
  // refs[rowIndex][colIndex]
  const inputRefs = useRef<(HTMLInputElement | null)[][]>([]);

  const ensureRowRef = (rowIndex: number) => {
    if (!inputRefs.current[rowIndex]) inputRefs.current[rowIndex] = [];
    return inputRefs.current[rowIndex];
  };

  const focusNext = (
    e: KeyboardEvent<HTMLInputElement>,
    startRow: number,
    startCol: number,
    dir: 1 | -1,
  ) => {
    const refs = inputRefs.current;
    const rowCount = refs.length;
    if (rowCount === 0) return;

    const colCount = grid.corners.length;
    if (colCount === 0) return;

    const total = rowCount * colCount;
    const flat = startRow * colCount + startCol;

    for (let step = 1; step <= total; step++) {
      const nextFlat = (flat + dir * step + total) % total;
      const r = Math.floor(nextFlat / colCount);
      const c = nextFlat % colCount;

      const el = refs[r]?.[c] ?? null;
      if (el) {
        e.preventDefault();
        el.focus();
        el.select?.();
        return;
      }
    }
  };

  const handleKeyDown =
    (rowIndex: number, colIndex: number) =>
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (!open) return;

      // Tab stays within grid
      if (e.key === "Tab") {
        focusNext(e, rowIndex, colIndex, e.shiftKey ? -1 : 1);
        return;
      }

      // Optional: arrow keys (nice with tables)
      if (
        e.key !== "ArrowUp" &&
        e.key !== "ArrowDown" &&
        e.key !== "ArrowLeft" &&
        e.key !== "ArrowRight"
      ) {
        return;
      }

      const refs = inputRefs.current;
      const rowCount = refs.length;
      const colCount = grid.corners.length;

      const focusCell = (r: number, c: number) => {
        const el = refs[r]?.[c] ?? null;
        if (!el) return false;
        e.preventDefault();
        el.focus();
        el.select?.();
        return true;
      };

      if (e.key === "ArrowLeft") {
        for (let c = colIndex - 1; c >= 0; c--) {
          if (focusCell(rowIndex, c)) return;
        }
        return;
      }

      if (e.key === "ArrowRight") {
        for (let c = colIndex + 1; c < colCount; c++) {
          if (focusCell(rowIndex, c)) return;
        }
        return;
      }

      if (e.key === "ArrowUp") {
        for (let r = rowIndex - 1; r >= 0; r--) {
          if (focusCell(r, colIndex)) return;
        }
        return;
      }

      if (e.key === "ArrowDown") {
        for (let r = rowIndex + 1; r < rowCount; r++) {
          if (focusCell(r, colIndex)) return;
        }
      }
    };

  if (!grid.rows.length) return null;

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-end px-1">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-full border border-[color:var(--metal-border-soft,#1f2937)] bg-black/60 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-neutral-100 shadow-[0_10px_24px_rgba(0,0,0,0.75)] hover:border-orange-500 hover:bg-black/70"
          aria-expanded={open}
          title={open ? "Collapse" : "Expand"}
          tabIndex={-1}
        >
          {open ? "Collapse" : "Expand"}
        </button>
      </div>

      <div className="overflow-x-auto">
        <div className="inline-block min-w-full align-middle">
          {/* ✅ UI: tighter, less “pilly”: one container + row dividers */}
          <div className="overflow-hidden rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/55 shadow-[0_18px_45px_rgba(0,0,0,0.9)] backdrop-blur-xl">
            <table className="min-w-full">
              <thead className="bg-black/35">
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
                <tbody className="divide-y divide-[color:var(--metal-border-soft,#1f2937)]">
                  {grid.rows.map((row, rowIdx) => (
                    <tr
                      key={`${row.metric}-${rowIdx}`}
                      className="align-middle hover:bg-white/[0.03]"
                    >
                      <td className="px-3 py-2 text-sm font-semibold text-neutral-100">
                        <div className="flex items-center gap-2">
                          <span className="leading-tight">{row.metric}</span>
                          {onSpecHint && (
                            <button
                              type="button"
                              tabIndex={-1}
                              onClick={() => onSpecHint(row.metric)}
                              className="rounded-full border border-orange-500/50 bg-orange-500/10 px-2 py-[2px] text-[9px] font-semibold uppercase tracking-[0.16em] text-orange-300 hover:bg-orange-500/20"
                              title="Show spec"
                            >
                              Spec
                            </button>
                          )}
                        </div>
                      </td>

                      {grid.corners.map((corner, colIdx) => {
                        const cell = row.cells.find((c) => c.corner === corner);

                        if (!cell) {
                          // keep alignment: also keep a null ref slot
                          const rowRef = ensureRowRef(rowIdx);
                          rowRef[colIdx] = null;
                          return (
                            <td key={corner} className="px-3 py-2">
                              <div className="h-[30px]" />
                            </td>
                          );
                        }

                        return (
                          <td key={corner} className="px-3 py-2 text-center">
                            <div className="relative w-full max-w-[9rem]">
                              <input
                                ref={(el) => {
                                  const rowRef = ensureRowRef(rowIdx);
                                  rowRef[colIdx] = el;
                                }}
                                defaultValue={cell.initial}
                                className="w-full rounded-lg border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 px-3 py-1.5 pr-11 text-sm text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/70"
                                placeholder="Value"
                                autoComplete="off"
                                inputMode="decimal"
                                onKeyDown={handleKeyDown(rowIdx, colIdx)}
                                onBlur={(e) => commit(cell.idx, e.currentTarget)}
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