// features/inspections/lib/inspection/ui/CornerGrid.tsx
"use client";

import { useMemo, useState } from "react";
import { useInspectionForm } from "@inspections/lib/inspection/ui/InspectionFormContext";
import type { InspectionItem } from "@inspections/lib/inspection/types";

type Props = {
  sectionIndex: number;
  items: InspectionItem[];
  unitHint?: (label: string) => string;
  /** Kept for API compatibility, but CornerGrid no longer renders spec buttons. */
  onSpecHint?: (fullLabel: string) => void;
};

type Corner = "LF" | "RF" | "LR" | "RR";

type Cell = {
  idx: number;
  corner: Corner;
  metric: string;
  unit: string;
  fullLabel: string;
  initial: string;
};

type Row = {
  metric: string;
  cellsByCorner: Partial<Record<Corner, Cell>>;
};

const CORNER_RE = /^(?<corner>LF|RF|LR|RR)\s+(?<metric>.+)$/i;
const CORNERS: Corner[] = ["LF", "RF", "LR", "RR"];

// ✅ CornerGrid: ONLY brake pads/shoes + rotors/drums (no torque/spec/condition)
const isAllowedCornerMetric = (metric: string) => {
  const m = metric.toLowerCase();
  const isPadShoe = /(pad|lining|shoe)/i.test(m);
  const isRotorDrum = /(rotor|drum)/i.test(m);
  return isPadShoe || isRotorDrum;
};

const metricRank = (metric: string) => {
  const m = metric.toLowerCase();
  if (/(pad|lining|shoe)/i.test(m)) return 0;
  if (/(rotor|drum)/i.test(m)) return 1;
  return 999;
};

export default function CornerGrid({
  sectionIndex,
  items,
  unitHint,
}: Props) {
  const { updateItem } = useInspectionForm();
  const [open, setOpen] = useState(true);

  const commit = (idx: number, value: string) => {
    updateItem(sectionIndex, idx, { value });
  };

  const grid = useMemo(() => {
    const cells: Cell[] = [];

    items.forEach((it, idx) => {
      const label = it.item ?? "";
      if (!label) return;

      const m = label.match(CORNER_RE);
      if (!m?.groups) return;

      const corner = m.groups.corner.trim().toUpperCase() as Corner;
      if (!CORNERS.includes(corner)) return;

      const metric = m.groups.metric.trim();
      if (!isAllowedCornerMetric(metric)) return;

      const unit = (it.unit ?? "") || (unitHint ? unitHint(label) : "") || "";

      cells.push({
        idx,
        corner,
        metric,
        unit,
        fullLabel: label,
        initial: String(it.value ?? ""),
      });
    });

    if (cells.length === 0) return null;

    const corners = CORNERS.filter((c) => cells.some((x) => x.corner === c));

    const byMetric = new Map<string, Row>();
    for (const cell of cells) {
      const key = cell.metric.toLowerCase();
      const existing = byMetric.get(key);
      if (!existing) {
        byMetric.set(key, {
          metric: cell.metric,
          cellsByCorner: { [cell.corner]: cell },
        });
      } else {
        existing.cellsByCorner[cell.corner] = cell;
      }
    }

    const rows = Array.from(byMetric.values()).sort((a, b) => {
      const ra = metricRank(a.metric);
      const rb = metricRank(b.metric);
      if (ra !== rb) return ra - rb;
      return a.metric.localeCompare(b.metric);
    });

    return { corners, rows };
  }, [items, unitHint]);

  if (!grid) return null;

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-end px-1">
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
                      style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}
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
                      <td className="px-3 py-2 text-sm font-semibold text-foreground">
                        {row.metric}
                      </td>

                      {grid.corners.map((corner) => {
                        const cell = row.cellsByCorner[corner];
                        if (!cell) {
                          return (
                            <td key={corner} className="px-3 py-2">
                              <div className="h-[32px]" />
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