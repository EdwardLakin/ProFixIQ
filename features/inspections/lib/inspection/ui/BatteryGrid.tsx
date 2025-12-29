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

type MetricKind = "rating" | "tested" | "condition";

type BatteryCell = {
  idx: number;
  battery: string; // e.g. "Battery 1"
  metric: string; // e.g. "Rating"
  kind: MetricKind;
  unit: string;
  fullLabel: string;
  initial: string;
};

type BatteryRow = {
  metric: string;
  kind: MetricKind;
  cells: BatteryCell[]; // ordered by battery index
};

const BATTERY_RE = /^(?<battery>Battery\s*\d+)\s+(?<metric>.+)$/i;

// Only use these 3 kinds of rows
const METRIC_ORDER: MetricKind[] = ["rating", "tested", "condition"];

const classifyMetric = (label: string): MetricKind | null => {
  const lower = label.toLowerCase();

  if (lower.includes("rating")) return "rating";
  if (lower.includes("tested") || lower.includes("test")) return "tested";
  if (lower.includes("condition")) return "condition";

  return null;
};

const metricCompare = (a: string, b: string) => {
  const ca = classifyMetric(a);
  const cb = classifyMetric(b);

  const ai =
    ca !== null ? METRIC_ORDER.indexOf(ca) : Number.MAX_SAFE_INTEGER;
  const bi =
    cb !== null ? METRIC_ORDER.indexOf(cb) : Number.MAX_SAFE_INTEGER;

  if (ai !== bi) return ai - bi;
  return a.localeCompare(b);
};

const batteryIndex = (battery: string): number => {
  const m = battery.match(/battery\s*(\d+)/i);
  if (m?.[1]) {
    const n = Number(m[1]);
    if (Number.isFinite(n)) return n;
  }
  return Number.MAX_SAFE_INTEGER;
};

export default function BatteryGrid({
  sectionIndex,
  items,
  unitHint,
}: Props) {
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

      const battery = m.groups.battery.trim();
      const metric = m.groups.metric.trim();

      // Only keep metrics we care about
      const kind = classifyMetric(metric);
      if (!kind) return;

      let unit =
        (it.unit ?? "").trim() ||
        (unitHint ? unitHint(label).trim() : "");

      // Default units by kind if still empty:
      // - Rating: CCA
      // - Tested: CCA
      // - Condition: no unit (notes)
      if (!unit) {
        if (kind === "rating" || kind === "tested") {
          unit = "CCA";
        } else {
          unit = "";
        }
      }

      allCells.push({
        idx,
        battery,
        metric,
        kind,
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
      const existing = byMetric.get(key) || {
        metric: cell.metric,
        kind: cell.kind,
        cells: [] as BatteryCell[],
      };
      byMetric.set(key, {
        ...existing,
        metric: cell.metric,
        kind: cell.kind,
        cells: [...existing.cells, cell],
      });
    }

    let rows = Array.from(byMetric.values()).map((row) => ({
      ...row,
      cells: [...row.cells].sort(
        (a, b) => batteryIndex(a.battery) - batteryIndex(b.battery),
      ),
    }));

    // Final safety filter + sort
    rows = rows
      .filter((row) => classifyMetric(row.metric) !== null)
      .sort((a, b) => metricCompare(a.metric, b.metric));

    return { batteries, rows };
  }, [items, unitHint]);

  type InputCellProps = {
    idx: number;
    unit: string;
    defaultValue: string;
    rowIndex: number;
    colIndex: number;
    kind: MetricKind;
  };

  /**
   * Single input cell with arrow-key navigation.
   * Rating/Tested: numeric CCA; Condition: free-text notes.
   */
  const InputCell = ({
    idx,
    unit,
    defaultValue,
    rowIndex,
    colIndex,
    kind,
  }: InputCellProps) => {
    const spanRef = useRef<HTMLSpanElement | null>(null);

    const moveFocus = (targetRow: number, targetCol: number) => {
      const selector = `input[data-battery-section="${sectionIndex}"][data-row="${targetRow}"][data-col="${targetCol}"]`;
      const el = document.querySelector<HTMLInputElement>(selector);
      if (el) el.focus();
    };

    const placeholder =
      kind === "rating"
        ? "CCA"
        : kind === "tested"
        ? "Test CCA"
        : "Notes";

    const inputMode = kind === "condition" ? "text" : "decimal";

    return (
      <div className="relative w-full max-w-[8.5rem]">
        <input
          defaultValue={defaultValue}
          tabIndex={0}
          className="w-full rounded-lg border border-slate-700/70 bg-slate-950/70 px-3 py-1.5 pr-14 text-sm text-foreground placeholder:text-slate-500 focus:border-orange-400 focus:ring-2 focus:ring-orange-400"
          placeholder={placeholder}
          autoComplete="off"
          inputMode={inputMode}
          data-battery-section={sectionIndex}
          data-row={rowIndex}
          data-col={colIndex}
          onBlur={(e) => commit(idx, e.currentTarget)}
          onKeyDown={(e) => {
            const key = e.key;

            if (key === "Enter") {
              (e.currentTarget as HTMLInputElement).blur();
              return;
            }

            // Arrow navigation stays inside this grid
            if (key === "ArrowRight") {
              e.preventDefault();
              moveFocus(rowIndex, colIndex + 1);
            } else if (key === "ArrowLeft") {
              e.preventDefault();
              moveFocus(rowIndex, colIndex - 1);
            } else if (key === "ArrowDown") {
              e.preventDefault();
              moveFocus(rowIndex + 1, colIndex);
            } else if (key === "ArrowUp") {
              e.preventDefault();
              moveFocus(rowIndex - 1, colIndex);
            }
          }}
        />
        {!!unit && (
          <span
            ref={spanRef}
            className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 whitespace-nowrap text-[11px] text-muted-foreground"
          >
            {unit}
          </span>
        )}
      </div>
    );
  };

  if (!grid.rows.length) {
    // Fallback: nothing matched "Battery N ..." + our 3 metrics — let parent fall back.
    return null;
  }

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
          <div className="overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-950/70 shadow-[0_18px_45px_rgba(0,0,0,0.85)] backdrop-blur-xl">
            <table className="min-w-full border-separate border-spacing-y-1">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th className="px-3 py-2 text-left text-[11px] font-normal uppercase tracking-[0.16em] text-slate-400">
                    Metric
                  </th>
                  {grid.batteries.map((batt) => (
                    <th
                      key={batt}
                      className="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-100"
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
                      <td className="px-3 py-2 text-sm font-semibold text-foreground">
                        {row.metric}
                      </td>
                      {grid.batteries.map((batt, colIdx) => {
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
                              rowIndex={rowIdx}
                              colIndex={colIdx}
                              kind={cell.kind}
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