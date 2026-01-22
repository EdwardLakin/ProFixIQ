// features/inspections/lib/inspection/ui/CornerGrid.tsx
"use client";

import { useMemo, useState } from "react";
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
const CORNERS: Corner[] = ["LF", "RF", "LR", "RR"];

// Brakes-first ordering (tires removed from this grid)
const METRIC_ORDER = ["Brake Pad", "Rotor Thickness", "Wheel Torque"];

const metricCompare = (a: string, b: string) => {
  const ai = METRIC_ORDER.findIndex((m) =>
    a.toLowerCase().includes(m.toLowerCase()),
  );
  const bi = METRIC_ORDER.findIndex((m) =>
    b.toLowerCase().includes(m.toLowerCase()),
  );

  const A = ai === -1 ? Number.MAX_SAFE_INTEGER : ai;
  const B = bi === -1 ? Number.MAX_SAFE_INTEGER : bi;
  if (A !== B) return A - B;
  return a.localeCompare(b);
};

const isTireMetric = (metric: string) => {
  const m = metric.toLowerCase();
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

  const commit = (idx: number, value: string) => {
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
      if (!CORNERS.includes(corner)) return;

      const metric = m.groups.metric.trim();

      // Keep this grid brakes-only: drop tire metrics here
      if (isTireMetric(metric)) return;

      const unit =
        (it.unit ?? "").trim() || (unitHint ? unitHint(label).trim() : "");

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

    const corners: Corner[] = CORNERS.filter((c) =>
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
          (a, b) => CORNERS.indexOf(a.corner) - CORNERS.indexOf(b.corner),
        ),
      }))
      .sort((a, b) => metricCompare(a.metric, b.metric));

    return { corners, rows };
  }, [items, unitHint]);

  if (!grid.rows.length) return null;

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-end gap-3 px-1">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-md border border-slate-600/50 bg-slate-900/40 px-2 py-1 text-xs text-slate-100 hover:border-orange-400/70 hover:bg-slate-900/70"
          aria-expanded={open}
          title={open ? "Collapse" : "Expand"}
          tabIndex={-1}
        >
          {open ? "Collapse" : "Expand"}
        </button>
      </div>

      <div className="overflow-x-auto">
        <div className="inline-block min-w-full align-middle">
          {/* Match BatteryGrid structure so native Tab order behaves the same */}
          <div className="overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-950/70 shadow-[0_18px_45px_rgba(0,0,0,0.85)] backdrop-blur-xl">
            <table className="min-w-full border-separate border-spacing-y-1">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th className="px-3 py-2 text-left text-[11px] font-normal uppercase tracking-[0.16em] text-slate-400">
                    Item
                  </th>
                  {grid.corners.map((corner) => (
                    <th
                      key={corner}
                      className="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-100"
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
                  {grid.rows.map((row, rowIndex) => (
                    <tr key={`${row.metric}-${rowIndex}`} className="align-middle">
                      <td className="px-3 py-2 text-sm font-semibold text-foreground">
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

                      {grid.corners.map((corner) => {
                        const cell = row.cells.find((c) => c.corner === corner);
                        if (!cell) {
                          return (
                            <td key={corner} className="px-3 py-2">
                              <div className="h-[34px]" />
                            </td>
                          );
                        }

                        return (
                          <td key={corner} className="px-3 py-2 text-center">
                            <div className="relative w-full max-w-[8.5rem]">
                              <input
                                defaultValue={cell.initial}
                                className="w-full rounded-lg border border-slate-700/70 bg-slate-950/70 px-3 py-1.5 pr-14 text-sm text-foreground placeholder:text-slate-500 focus:border-orange-400 focus:ring-2 focus:ring-orange-400"
                                placeholder="Value"
                                autoComplete="off"
                                inputMode="decimal"
                                onBlur={(e) => commit(cell.idx, e.currentTarget.value)}
                              />
                              {cell.unit ? (
                                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 whitespace-nowrap text-[11px] text-muted-foreground">
                                  {cell.unit}
                                </span>
                              ) : null}
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