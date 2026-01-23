// features/inspections/lib/inspection/ui/BatteryGrid.tsx
"use client";

import { useMemo, useState } from "react";
import { useInspectionForm } from "@inspections/lib/inspection/ui/InspectionFormContext";
import type { InspectionItem } from "@inspections/lib/inspection/types";

type Props = {
  sectionIndex: number;
  items: InspectionItem[];
  /** Optional unit resolver when an item has no unit */
  unitHint?: (label: string) => string;
};

type MetricKind = "rating" | "tested" | "voltage" | "condition";

type BatteryCell = {
  idx: number;
  battery: string; // normalized: "Battery 1"
  metric: string; // display label
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

/**
 * Accepts a bunch of real-world formats:
 * - "Battery 1 Rating"
 * - "Battery #1 Rating"
 * - "Battery 1: Rating"
 * - "Battery 1 - Rating"
 * - "Bat 1 Tested"
 * - "BATTERY 2 Voltage"
 */
const BATTERY_RE =
  /^(?<battery>(?:battery|bat)\s*#?\s*(?<num>\d+))\s*[:\-–—]?\s+(?<metric>.+)$/i;

const METRIC_ORDER: MetricKind[] = ["rating", "tested", "voltage", "condition"];

function normalizeBattery(raw: string): string {
  const m = raw.match(/(?:battery|bat)\s*#?\s*(\d+)/i);
  const n = m?.[1] ? Number(m[1]) : NaN;
  if (Number.isFinite(n)) return `Battery ${n}`;
  return raw.trim();
}

function batteryIndex(battery: string): number {
  const m = battery.match(/battery\s*(\d+)/i);
  if (m?.[1]) {
    const n = Number(m[1]);
    if (Number.isFinite(n)) return n;
  }
  return Number.MAX_SAFE_INTEGER;
}

const classifyMetric = (label: string): MetricKind | null => {
  const lower = label.toLowerCase();

  // rating (CCA rated)
  if (lower.includes("rating") || lower.includes("rated")) return "rating";
  if (/\bcca\s*rating\b/i.test(label) || /\brated\s*cca\b/i.test(label))
    return "rating";

  // tested (load test / measured CCA / test result)
  if (lower.includes("tested") || lower.includes("test") || lower.includes("load"))
    return "tested";
  if (/\bmeasured\s*cca\b/i.test(label) || /\btest(ed)?\s*cca\b/i.test(label))
    return "tested";

  // voltage
  if (lower.includes("voltage") || /\bvolts?\b/i.test(label) || /\b\d+(\.\d+)?\s*v\b/i.test(label))
    return "voltage";

  // condition / pass fail / notes
  if (
    lower.includes("condition") ||
    lower.includes("pass") ||
    lower.includes("fail") ||
    lower.includes("status") ||
    lower.includes("notes")
  )
    return "condition";

  return null;
};

const metricCompare = (a: BatteryRow, b: BatteryRow) => {
  const ai = METRIC_ORDER.indexOf(a.kind);
  const bi = METRIC_ORDER.indexOf(b.kind);
  if (ai !== bi) return ai - bi;
  return a.metric.localeCompare(b.metric);
};

function prettyMetric(kind: MetricKind, metricRaw: string): string {
  // Keep template wording if it's already clean, but normalize common messy labels.
  const m = metricRaw.trim();

  if (kind === "rating") return /rating/i.test(m) ? m : "Rating";
  if (kind === "tested") return /test/i.test(m) ? m : "Tested";
  if (kind === "voltage") return /volt/i.test(m) ? m : "Voltage";
  return /condition/i.test(m) ? m : "Condition";
}

function unitForKind(
  kind: MetricKind,
  label: string,
  explicitUnit: string | null | undefined,
  unitHint?: (label: string) => string,
): string {
  if (kind === "rating" || kind === "tested") return "CCA";
  if (kind === "voltage") return "V";

  const u = (explicitUnit ?? "").trim();
  if (u) return u;

  const hinted = (unitHint ? unitHint(label) : "").trim();
  return hinted;
}

export default function BatteryGrid({ sectionIndex, items, unitHint }: Props) {
  const { updateItem } = useInspectionForm();
  const [open, setOpen] = useState(true);

  const commit = (idx: number, value: string) => {
    updateItem(sectionIndex, idx, { value });
  };

  const grid = useMemo<{
    batteries: string[];
    rows: BatteryRow[];
  }>(() => {
    const allCells: BatteryCell[] = [];

    items.forEach((it, idx) => {
      const label = (it.item ?? "").trim();
      if (!label) return;

      const m = label.match(BATTERY_RE);
      if (!m?.groups) return;

      const batteryRaw = String(m.groups.battery ?? "").trim();
      const metricRaw = String(m.groups.metric ?? "").trim();
      if (!batteryRaw || !metricRaw) return;

      const battery = normalizeBattery(batteryRaw);
      const kind = classifyMetric(metricRaw);
      if (!kind) return;

      const metric = prettyMetric(kind, metricRaw);
      const unit = unitForKind(kind, label, it.unit ?? null, unitHint);

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

    const batteries = Array.from(new Set(allCells.map((c) => c.battery))).sort(
      (a, b) => batteryIndex(a) - batteryIndex(b),
    );

    // Group by (kind) primarily, then metric label
    const byKey = new Map<string, BatteryRow>();
    for (const cell of allCells) {
      const key = `${cell.kind}:${cell.metric.toLowerCase()}`;
      const existing = byKey.get(key) || {
        metric: cell.metric,
        kind: cell.kind,
        cells: [] as BatteryCell[],
      };

      byKey.set(key, {
        ...existing,
        metric: cell.metric,
        kind: cell.kind,
        cells: [...existing.cells, cell],
      });
    }

    let rows = Array.from(byKey.values()).map((row) => ({
      ...row,
      cells: [...row.cells].sort(
        (a, b) => batteryIndex(a.battery) - batteryIndex(b.battery),
      ),
    }));

    rows = rows
      .filter((row) => METRIC_ORDER.includes(row.kind))
      .sort(metricCompare);

    return { batteries, rows };
  }, [items, unitHint]);

  if (!grid.rows.length) return null;

  return (
    <div className="grid gap-2">
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
            <table className="min-w-full border-separate border-spacing-y-[2px]">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th className="px-3 py-1.5 text-left text-[11px] font-normal uppercase tracking-[0.16em] text-slate-400">
                    Metric
                  </th>
                  {grid.batteries.map((batt) => (
                    <th
                      key={batt}
                      className="px-3 py-1.5 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-100"
                      style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}
                    >
                      {batt}
                    </th>
                  ))}
                </tr>
              </thead>

              {open && (
                <tbody>
                  {grid.rows.map((row, rowIndex) => (
                    <tr key={`${row.kind}-${row.metric}-${rowIndex}`} className="align-middle">
                      <td className="px-3 py-1.5 text-sm font-semibold text-foreground">
                        {row.metric}
                      </td>

                      {grid.batteries.map((batt) => {
                        const cell = row.cells.find((c) => c.battery === batt);
                        if (!cell) {
                          return (
                            <td key={batt} className="px-3 py-1.5">
                              <div className="h-[32px]" />
                            </td>
                          );
                        }

                        const isNumericRow =
                          cell.kind === "rating" ||
                          cell.kind === "tested" ||
                          cell.kind === "voltage";

                        const placeholder =
                          cell.kind === "rating"
                            ? "Rating"
                            : cell.kind === "tested"
                              ? "Test"
                              : cell.kind === "voltage"
                                ? "Volts"
                                : "Notes";

                        const rightUnit = cell.unit?.trim();

                        return (
                          <td key={batt} className="px-3 py-1.5 text-center">
                            <div className="relative w-full max-w-[7.75rem]">
                              <input
                                defaultValue={cell.initial}
                                className="w-full rounded-lg border border-slate-700/70 bg-slate-950/70 px-3 py-1.5 pr-12 text-sm text-foreground placeholder:text-slate-500 focus:border-orange-400 focus:ring-2 focus:ring-orange-400"
                                placeholder={placeholder}
                                autoComplete="off"
                                inputMode={isNumericRow ? "decimal" : "text"}
                                onBlur={(e) => commit(cell.idx, e.currentTarget.value)}
                              />
                              {rightUnit ? (
                                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 whitespace-nowrap text-[11px] text-muted-foreground">
                                  {rightUnit}
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