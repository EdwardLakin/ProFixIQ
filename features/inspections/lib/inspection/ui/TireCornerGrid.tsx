"use client";

import { useMemo, useState } from "react";
import { useInspectionForm } from "@inspections/lib/inspection/ui/InspectionFormContext";
import type { InspectionItem } from "@inspections/lib/inspection/types";

type Props = {
  sectionIndex: number;
  items: InspectionItem[];
  unitHint?: (label: string) => string;
  onAddAxle?: (axleLabel: string) => void;
  /** Kept for API compatibility */
  onSpecHint?: (metricLabel: string) => void;
};

type Side = "Left" | "Right";
type Corner = "LF" | "RF" | "LR" | "RR";

type Cell = {
  idx: number;
  axle?: string; // for axle mode
  side?: Side; // axle mode
  corner?: Corner; // corner mode
  metric: string;
  unit: string;
  fullLabel: string;
  initial: string;
};

type Row = {
  metric: string;
  left?: Cell;
  right?: Cell;
  axleOnly?: Cell;
  lf?: Cell;
  rf?: Cell;
  lr?: Cell;
  rr?: Cell;
};

type AxleTable = {
  axle: string;
  rows: Row[];
};

const LABEL_AXLE_SIDE_RE =
  /^(?<axle>.+?)\s+(?<side>Left|Right|L|R|Driver|Passenger|DS|PS)\s+(?<metric>.+)$/i;

// Corner-first patterns like: "LF Tire Pressure", "Left Front Tread Depth (Outer)"
const LABEL_CORNER_FIRST_RE =
  /^(?<corner>LF|RF|LR|RR|Left\s+Front|Right\s+Front|Left\s+Rear|Right\s+Rear)\s+(?<metric>.+)$/i;

// Supports axle-only rows like: "Drive 1 Wheel Torque"
const LABEL_AXLE_ONLY_RE = /^(?<axle>.+?)\s+(?<metric>.+)$/i;

function normalizeSide(raw: string): Side | null {
  const s = raw.trim().toLowerCase();
  if (s === "left" || s === "l" || s === "driver" || s === "ds") return "Left";
  if (s === "right" || s === "r" || s === "passenger" || s === "ps") return "Right";
  return null;
}

function normalizeCorner(raw: string): Corner | null {
  const s = raw.trim().toLowerCase();
  if (s === "lf" || s === "left front") return "LF";
  if (s === "rf" || s === "right front") return "RF";
  if (s === "lr" || s === "left rear") return "LR";
  if (s === "rr" || s === "right rear") return "RR";
  return null;
}

const isPressureMetric = (metric: string) => /tire\s*pressure/i.test(metric);
const isTreadMetric = (metric: string) =>
  /(tread\s*depth|tire\s*tread|tread\s*depth)/i.test(metric);
const isWheelTorqueMetric = (metric: string) => /wheel\s*torque/i.test(metric);

const isAllowedTireMetric = (metric: string) =>
  isPressureMetric(metric) || isTreadMetric(metric) || isWheelTorqueMetric(metric);

const metricRank = (metric: string) => {
  if (isPressureMetric(metric)) return 0;
  if (isTreadMetric(metric)) return 1;
  if (isWheelTorqueMetric(metric)) return 2;
  return 999;
};

type TireMetricKind =
  | "pressure"
  | "tread_outer"
  | "tread_inner"
  | "tread"
  | "torque"
  | "other";

function tireMetricKind(metric: string): TireMetricKind {
  const m = (metric || "").toLowerCase().trim();
  if (isPressureMetric(m)) return "pressure";
  if (isWheelTorqueMetric(m)) return "torque";
  if (isTreadMetric(m)) {
    if (m.includes("outer") || m.includes("out")) return "tread_outer";
    if (m.includes("inner") || m.includes("in")) return "tread_inner";
    return "tread";
  }
  return "other";
}

function bestUnitFromCells(cells: Cell[], fallback: string): string {
  const u = cells.map((c) => (c.unit || "").trim()).find((x) => x.length > 0);
  return u || fallback;
}

export default function TireCornerGrid({
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

  // ------------------------------------------------------------
  // Corner-mode: build cells
  // ------------------------------------------------------------
  const cornerCells = useMemo(() => {
    const cells: Cell[] = [];

    items.forEach((it, idx) => {
      const label = it.item ?? "";
      if (!label) return;

      const m = label.match(LABEL_CORNER_FIRST_RE);
      if (!m?.groups) return;

      const corner = normalizeCorner(String(m.groups.corner ?? ""));
      if (!corner) return;

      const metric = String(m.groups.metric ?? "").trim();
      if (!isAllowedTireMetric(metric)) return;

      // In corner mode we do not accept wheel torque (usually axle-based)
      if (isWheelTorqueMetric(metric)) return;

      const unit =
        (it.unit ?? "") || (unitHint ? unitHint(label) : "") || "";

      cells.push({
        idx,
        corner,
        metric,
        unit,
        fullLabel: label,
        initial: String(it.value ?? ""),
      });
    });

    return cells;
  }, [items, unitHint]);

  // New corner layout: rows = corners, columns = Outer | Pressure | Inner
  const cornerGrid = useMemo(() => {
    if (cornerCells.length === 0) return null;

    type CornerRow = {
      corner: Corner;
      treadOuter?: Cell;
      pressure?: Cell;
      treadInner?: Cell;
      treadGeneric?: Cell;
    };

    const byCorner = new Map<Corner, CornerRow>();
    const ensure = (c: Corner): CornerRow => {
      const ex = byCorner.get(c);
      if (ex) return ex;
      const fresh: CornerRow = { corner: c };
      byCorner.set(c, fresh);
      return fresh;
    };

    for (const cell of cornerCells) {
      const corner = cell.corner!;
      const kind = tireMetricKind(cell.metric);
      const row = ensure(corner);

      if (kind === "pressure") row.pressure = row.pressure ?? cell;
      else if (kind === "tread_outer") row.treadOuter = row.treadOuter ?? cell;
      else if (kind === "tread_inner") row.treadInner = row.treadInner ?? cell;
      else if (kind === "tread") row.treadGeneric = row.treadGeneric ?? cell;
    }

    const orderedCorners: Corner[] = ["LF", "RF", "LR", "RR"];
    const rows = orderedCorners
      .map((c) => byCorner.get(c))
      .filter((r): r is CornerRow => !!r);

    if (rows.length === 0) return null;

    // If template only gives a single tread depth per corner, use it as both outside/inside
    const normalizedRows = rows.map((r) => {
      const outer = r.treadOuter ?? r.treadGeneric;
      const inner = r.treadInner ?? r.treadGeneric;
      return { ...r, treadOuter: outer, treadInner: inner };
    });

    const allPressure = cornerCells.filter((c) => tireMetricKind(c.metric) === "pressure");
    const allTread = cornerCells.filter((c) => {
      const k = tireMetricKind(c.metric);
      return k === "tread_outer" || k === "tread_inner" || k === "tread";
    });

    const pressureUnitGuess =
      unitHint?.("Tire Pressure") ||
      bestUnitFromCells(allPressure, "");

    // ✅ add back the kPa hint behavior:
    // if unitHint would have returned kPa in metric mode, show it even if no explicit item.unit was set.
    const pressureUnit = pressureUnitGuess || bestUnitFromCells(allPressure, "");

    const treadUnitGuess =
      unitHint?.("Tread Depth") ||
      bestUnitFromCells(allTread, "");

    const treadUnit = treadUnitGuess || bestUnitFromCells(allTread, "");

    return {
      rows: normalizedRows,
      pressureUnit,
      treadUnit,
    };
  }, [cornerCells, unitHint]);

  // ------------------------------------------------------------
  // Axle-mode (unchanged structure, but we’ll keep it)
  // ------------------------------------------------------------
  const axleTables = useMemo<AxleTable[]>(() => {
    const byAxle = new Map<string, { sideCells: Cell[]; axleTorque?: Cell }>();

    const ensure = (axle: string) => {
      const existing = byAxle.get(axle);
      if (existing) return existing;
      const fresh = { sideCells: [] as Cell[], axleTorque: undefined as Cell | undefined };
      byAxle.set(axle, fresh);
      return fresh;
    };

    items.forEach((it, idx) => {
      const label = it.item ?? "";
      if (!label) return;

      // axle + side
      const mSide = label.match(LABEL_AXLE_SIDE_RE);
      if (mSide?.groups) {
        const axle = String(mSide.groups.axle ?? "").trim();
        const sideNorm = normalizeSide(String(mSide.groups.side ?? ""));
        if (!axle || !sideNorm) return;

        const metric = String(mSide.groups.metric ?? "").trim();
        if (!isAllowedTireMetric(metric)) return;

        const unit = (it.unit ?? "") || (unitHint ? unitHint(label) : "") || "";

        const cell: Cell = {
          idx,
          axle,
          side: sideNorm,
          metric,
          unit,
          fullLabel: label,
          initial: String(it.value ?? ""),
        };

        const bucket = ensure(axle);

        // consolidate wheel torque to axle-only
        if (isWheelTorqueMetric(metric)) {
          if (!bucket.axleTorque) bucket.axleTorque = cell;
          return;
        }

        bucket.sideCells.push(cell);
        return;
      }

      // axle-only (wheel torque)
      const mAxle = label.match(LABEL_AXLE_ONLY_RE);
      if (!mAxle?.groups) return;

      const axle = String(mAxle.groups.axle ?? "").trim();
      const metric = String(mAxle.groups.metric ?? "").trim();
      if (!axle || !isAllowedTireMetric(metric)) return;

      if (!isWheelTorqueMetric(metric)) return;

      const unit = (it.unit ?? "") || (unitHint ? unitHint(label) : "") || "";

      const cell: Cell = {
        idx,
        axle,
        metric,
        unit,
        fullLabel: label,
        initial: String(it.value ?? ""),
      };

      const bucket = ensure(axle);
      if (!bucket.axleTorque) bucket.axleTorque = cell;
    });

    const out: AxleTable[] = [];

    for (const [axle, bucket] of byAxle.entries()) {
      const rowMap = new Map<string, Row>();

      for (const c of bucket.sideCells) {
        const key = c.metric.toLowerCase();
        const existing = rowMap.get(key) ?? { metric: c.metric };
        if (c.side === "Left") existing.left = c;
        if (c.side === "Right") existing.right = c;
        rowMap.set(key, existing);
      }

      if (bucket.axleTorque) {
        rowMap.set("wheel torque", {
          metric: "Wheel Torque",
          axleOnly: bucket.axleTorque,
        });
      }

      const rows = Array.from(rowMap.values())
        .filter((r) => isAllowedTireMetric(r.metric))
        .sort((a, b) => {
          const ra = metricRank(a.metric);
          const rb = metricRank(b.metric);
          if (ra !== rb) return ra - rb;
          return a.metric.localeCompare(b.metric);
        });

      out.push({ axle, rows });
    }

    out.sort((a, b) => a.axle.localeCompare(b.axle));
    return out.filter((t) => t.rows.length > 0);
  }, [items, unitHint]);

  // Prefer cornerGrid (new layout) when available
  const mode: "corner" | "axle" | "none" =
    cornerGrid && cornerGrid.rows.length ? "corner" : axleTables.length ? "axle" : "none";

  if (mode === "none") return null;

  const headerHints =
    mode === "corner"
      ? {
          pressure: cornerGrid?.pressureUnit || "",
          tread: cornerGrid?.treadUnit || "",
        }
      : null;

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

      {mode === "axle" && onAddAxle ? (
        <AddAxlePicker tables={axleTables} onAddAxle={onAddAxle} />
      ) : null}

      {mode === "corner" ? (
        <div className="overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-950/70 shadow-[0_18px_45px_rgba(0,0,0,0.85)] backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex flex-col gap-1">
              <div
                className="text-base font-semibold uppercase tracking-[0.18em] text-[color:var(--accent-copper,#f97316)]"
                style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}
              >
                Tire Measurements
              </div>

              {/* ✅ bring back explicit kPa/psi hint (derived from unitHint / cells) */}
              {(headerHints?.pressure || headerHints?.tread) && (
                <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                  {headerHints.pressure ? `Pressure: ${headerHints.pressure}` : null}
                  {headerHints.pressure && headerHints.tread ? " • " : null}
                  {headerHints.tread ? `Tread: ${headerHints.tread}` : null}
                </div>
              )}
            </div>
          </div>

          {open ? (
            <div className="overflow-x-auto">
              <div className="inline-block min-w-full align-middle">
                {/* New layout: corners down the side, pressure in the middle */}
                <table className="min-w-full border-separate border-spacing-y-1">
                  <thead>
                    <tr className="text-xs text-muted-foreground">
                      <th className="px-3 py-2 text-left text-[11px] font-normal uppercase tracking-[0.16em] text-slate-400">
                        Corner
                      </th>
                      <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-100">
                        Tread (Outer)
                      </th>
                      <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-100">
                        Tire Pressure
                      </th>
                      <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-100">
                        Tread (Inner)
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {cornerGrid!.rows.map((r) => {
                      const corner = r.corner;

                      const renderCell = (cell?: Cell, maxW = "max-w-[9rem]") => {
                        if (!cell) return <div className="h-[32px]" />;
                        return (
                          <div className={`relative w-full ${maxW}`}>
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
                        );
                      };

                      return (
                        <tr key={`corner-${corner}`} className="align-middle">
                          <td className="px-3 py-2 text-sm font-semibold text-foreground">
                            {corner}
                          </td>

                          <td className="px-3 py-2 text-center">
                            {renderCell(r.treadOuter)}
                          </td>

                          <td className="px-3 py-2 text-center">
                            {renderCell(r.pressure)}
                          </td>

                          <td className="px-3 py-2 text-center">
                            {renderCell(r.treadInner)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        axleTables.map((t) => (
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
                      {t.rows.map((row, rowIdx) => {
                        if (row.axleOnly) {
                          const cell = row.axleOnly;
                          return (
                            <tr key={`${row.metric}-${rowIdx}`} className="align-middle">
                              <td className="px-3 py-2 text-sm font-semibold text-foreground">
                                {row.metric}
                              </td>
                              <td className="px-3 py-2" colSpan={2}>
                                <div className="relative w-full max-w-[18rem]">
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
                            </tr>
                          );
                        }

                        return (
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
                                      onBlur={(e) =>
                                        commit(cell.idx, e.currentTarget.value)
                                      }
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
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>
        ))
      )}
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