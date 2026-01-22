// features/inspections/lib/inspection/ui/AirCornerGrid.tsx
"use client";

import { useMemo, useState } from "react";
import { useInspectionForm } from "@inspections/lib/inspection/ui/InspectionFormContext";
import type { InspectionItem } from "@inspections/lib/inspection/types";

type Props = {
  sectionIndex: number;
  items: InspectionItem[];
  unitHint?: (label: string) => string;
  onAddAxle?: (axleLabel: string) => void;
  /** Kept for API compatibility, but AirCornerGrid no longer renders spec buttons. */
  onSpecHint?: (metricLabel: string) => void;
};

type Side = "Left" | "Right";

type Cell = {
  idx: number;
  axle: string;
  side: Side;
  metric: string;
  unit: string;
  fullLabel: string;
  initial: string;
};

type Row = {
  metric: string;
  left?: Cell;
  right?: Cell;
};

type AxleTable = {
  axle: string;
  rows: Row[];
};

const LABEL_RE = /^(?<axle>.+?)\s+(?<side>Left|Right)\s+(?<metric>.+)$/i;

// ✅ AirCornerGrid: pads/shoes/rotors/drums + push rod travel. NO torque.
const isAllowedAirMetric = (metric: string) => {
  const m = metric.toLowerCase();
  const isPadShoe = /(pad|lining|shoe)/i.test(m);
  const isRotorDrum = /(rotor|drum)/i.test(m);
  const isPushRod = /(push\s*rod)/i.test(m) && m.includes("travel");
  return isPadShoe || isRotorDrum || isPushRod;
};

const metricRank = (metric: string) => {
  const m = metric.toLowerCase();
  if (/(pad|lining|shoe)/i.test(m)) return 0;
  if (/(rotor|drum)/i.test(m)) return 1;
  if (/(push\s*rod)/i.test(m) && m.includes("travel")) return 2;
  return 999;
};

export default function AirCornerGrid({
  sectionIndex,
  items,
  unitHint,
  onAddAxle,
}: Props) {
  const { updateItem } = useInspectionForm();
  const [open, setOpen] = useState(true);

  const commit = (idx: number, value: string) => {
    updateItem(sectionIndex, idx, { value });
  };

  const tables = useMemo<AxleTable[]>(() => {
    const byAxle = new Map<string, Cell[]>();

    items.forEach((it, idx) => {
      const label = it.item ?? "";
      if (!label) return;

      const m = label.match(LABEL_RE);
      if (!m?.groups) return;

      const axle = m.groups.axle.trim();
      const side = (m.groups.side as Side) || "Left";
      const metric = m.groups.metric.trim();

      if (!isAllowedAirMetric(metric)) return;

      const unit = (it.unit ?? "") || (unitHint ? unitHint(label) : "") || "";

      const cell: Cell = {
        idx,
        axle,
        side,
        metric,
        unit,
        fullLabel: label,
        initial: String(it.value ?? ""),
      };

      const arr = byAxle.get(axle) ?? [];
      arr.push(cell);
      byAxle.set(axle, arr);
    });

    const out: AxleTable[] = [];
    for (const [axle, cells] of byAxle.entries()) {
      const rowMap = new Map<string, Row>();

      for (const c of cells) {
        const key = c.metric.toLowerCase();
        const existing = rowMap.get(key) ?? { metric: c.metric };
        if (c.side === "Left") existing.left = c;
        else existing.right = c;
        rowMap.set(key, existing);
      }

      const rows = Array.from(rowMap.values()).sort((a, b) => {
        const ra = metricRank(a.metric);
        const rb = metricRank(b.metric);
        if (ra !== rb) return ra - rb;
        return a.metric.localeCompare(b.metric);
      });

      out.push({ axle, rows });
    }

    out.sort((a, b) => a.axle.localeCompare(b.axle));
    return out;
  }, [items, unitHint]);

  if (tables.length === 0) return null;

  return (
    <div className="grid w-full gap-3">
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

      {onAddAxle ? <AddAxlePicker tables={tables} onAddAxle={onAddAxle} /> : null}

      {tables.map((t) => (
        <div
          key={t.axle}
          className="overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-950/70 shadow-[0_18px_45px_rgba(0,0,0,0.85)] backdrop-blur-xl"
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div
              className="text-base font-semibold uppercase tracking-[0.18em] text-[color:var(--accent-copper,#f97316)]"
              style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}
            >
              {t.axle}
            </div>
          </div>

          {open ? (
            <div className="overflow-x-auto">
              <div className="inline-block min-w-full align-middle">
                <table className="min-w-full border-separate border-spacing-y-1">
                  <thead>
                    <tr className="text-xs text-muted-foreground">
                      <th className="px-3 py-2 text-left text-[11px] font-normal uppercase tracking-[0.16em] text-slate-400">
                        Item
                      </th>
                      <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-100">
                        Left
                      </th>
                      <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-100">
                        Right
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {t.rows.map((row, rowIdx) => (
                      <tr key={`${row.metric}-${rowIdx}`} className="align-middle">
                        <td className="px-3 py-2 text-sm font-semibold text-foreground">
                          {row.metric}
                        </td>

                        {(["Left", "Right"] as const).map((side) => {
                          const cell = side === "Left" ? row.left : row.right;
                          if (!cell) {
                            return (
                              <td key={side} className="px-3 py-2">
                                <div className="h-[32px]" />
                              </td>
                            );
                          }

                          return (
                            <td key={side} className="px-3 py-2 text-center">
                              <div className="relative w-full max-w-[9rem]">
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
                </table>
              </div>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function AddAxlePicker({
  tables,
  onAddAxle,
}: {
  tables: { axle: string }[];
  onAddAxle: (axleLabel: string) => void;
}) {
  const existing = useMemo(() => tables.map((t) => t.axle), [tables]);
  const [pending, setPending] = useState<string>("");

  const candidates = useMemo(() => {
    const wants: string[] = [];
    for (let i = 1; i <= 2; i++) wants.push(`Steer ${i}`);
    for (let i = 1; i <= 4; i++) wants.push(`Drive ${i}`);
    wants.push("Tag", "Trailer 1", "Trailer 2", "Trailer 3");
    return wants.filter((l) => !existing.includes(l));
  }, [existing]);

  return (
    <div className="flex items-center gap-2 px-1">
      <select
        className="rounded-full border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 px-3 py-1 text-xs text-neutral-100 shadow-[0_10px_24px_rgba(0,0,0,0.85)] focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/80"
        value={pending}
        onChange={(e) => setPending(e.target.value)}
      >
        <option value="">Add axle…</option>
        {candidates.map((l) => (
          <option key={l} value={l}>
            {l}
          </option>
        ))}
      </select>
      <button
        className="rounded-full bg-[linear-gradient(to_right,var(--accent-copper-soft,#e17a3e),var(--accent-copper,#f97316))] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-black shadow-[0_0_18px_rgba(212,118,49,0.6)] hover:brightness-110 disabled:opacity-40"
        onClick={() => {
          if (pending) onAddAxle(pending);
        }}
        disabled={!pending}
        type="button"
      >
        + Add
      </button>
    </div>
  );
}