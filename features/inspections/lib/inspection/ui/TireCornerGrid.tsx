"use client";

import { useMemo, useState } from "react";
import { useInspectionForm } from "@inspections/lib/inspection/ui/InspectionFormContext";
import type { InspectionItem } from "@inspections/lib/inspection/types";

type Props = {
  sectionIndex: number;
  items: InspectionItem[];
  unitHint?: (label: string) => string;

  /**
   * Parent-owned “add axle” (kept for API compatibility).
   * We will call this with: "Steer 1", "Steer 2", "Tag", "Rear 1".."Rear 5", "Trailer 1".."Trailer 5"
   * Parent should add the correct item labels for that axle (including duals for rear/trailer).
   */
  onAddAxle?: (axleLabel: string) => void;

  /** Kept for API compatibility */
  onSpecHint?: (metricLabel: string) => void;
};

type AxleType = "steer" | "tag" | "rear" | "trailer";
type Side = "Left" | "Right";
type DualPos = "Outer" | "Inner";
type MetricKind = "pressure" | "tread" | "torque" | "other";

type TireKey =
  | "single_left"
  | "single_right"
  | "dual_left_outer"
  | "dual_left_inner"
  | "dual_right_inner"
  | "dual_right_outer";

type Cell = {
  idx: number;
  label: string;
  unit: string;
  initial: string;
  metricKind: MetricKind;
};

type TireCellGroup = {
  pressure?: Cell;
  tread?: Cell;
};

type AxleRow = {
  axleLabel: string; // "Steer 1" | "Rear 2" | "Trailer 3" | "Tag"
  axleType: AxleType;
  axleOrder: number; // for sorting
  isDual: boolean;

  // for single axles: left/right tire
  single: {
    left: TireCellGroup;
    right: TireCellGroup;
  };

  // for dual axles: 4 tires (LO, LI, RI, RO)
  dual: Record<TireKey, TireCellGroup>;

  // optional axle-only torque (rare)
  torque?: Cell | null;
};

const MAX = {
  steer: 2,
  tag: 1,
  rear: 5,
  trailer: 5,
};

const AXLE_LABEL_RE =
  /^(?<axle>Steer\s+\d+|Rear\s+\d+|Trailer\s+\d+|Tag)\s+(?<rest>.+)$/i;

const SIDE_RE = /\b(Left|Right|L|R|Driver|Passenger|DS|PS)\b/i;
const DUAL_POS_RE = /\b(Inner|Outer|In|Out)\b/i;

const isPressureMetric = (s: string) =>
  /tire\s*pressure|pressure\b|tp\b/i.test(s);
const isTreadMetric = (s: string) =>
  /tread\s*depth|tire\s*tread|tread\b|td\b/i.test(s);
const isWheelTorqueMetric = (s: string) =>
  /wheel\s*torque|torque\b/i.test(s);

function metricKindFrom(label: string): MetricKind {
  if (isWheelTorqueMetric(label)) return "torque";
  if (isPressureMetric(label)) return "pressure";
  if (isTreadMetric(label)) return "tread";
  return "other";
}

function normalizeAxleType(axleLabel: string): AxleType {
  const l = axleLabel.toLowerCase();
  if (l.startsWith("steer")) return "steer";
  if (l.startsWith("rear")) return "rear";
  if (l.startsWith("trailer")) return "trailer";
  return "tag";
}

function axleNumber(axleLabel: string): number {
  const m = axleLabel.match(/\b(\d+)\b/);
  return m ? Number(m[1]) : 0;
}

function axleOrder(axleLabel: string): number {
  // Steer first, then Tag, then Rear, then Trailer
  const t = normalizeAxleType(axleLabel);
  const n = axleNumber(axleLabel);
  if (t === "steer") return 10 + n;
  if (t === "tag") return 30;
  if (t === "rear") return 50 + n;
  return 80 + n; // trailer
}

function normalizeSide(raw: string): Side | null {
  const s = raw.trim().toLowerCase();
  if (s === "left" || s === "l" || s === "driver" || s === "ds") return "Left";
  if (s === "right" || s === "r" || s === "passenger" || s === "ps")
    return "Right";
  return null;
}

function normalizeDualPos(raw: string): DualPos | null {
  const s = raw.trim().toLowerCase();
  if (s === "outer" || s === "out") return "Outer";
  if (s === "inner" || s === "in") return "Inner";
  return null;
}

function pickUnit(itUnit: unknown, hint: string): string {
  const u = typeof itUnit === "string" ? itUnit.trim() : "";
  return u || hint || "";
}

function bestUnitFromCells(cells: Cell[], fallback: string): string {
  const u = cells.map((c) => (c.unit || "").trim()).find((x) => x.length > 0);
  return u || fallback;
}

function emptyGroup(): TireCellGroup {
  return {};
}

function makeDualMap(): Record<TireKey, TireCellGroup> {
  return {
    single_left: emptyGroup(),
    single_right: emptyGroup(),
    dual_left_outer: emptyGroup(),
    dual_left_inner: emptyGroup(),
    dual_right_inner: emptyGroup(),
    dual_right_outer: emptyGroup(),
  };
}

/**
 * Dual placement rules:
 * - If Inner/Outer exists → use it.
 * - If missing, place first seen per-side into Outer, second into Inner.
 */
function placeDualCell(
  row: AxleRow,
  side: Side,
  pos: DualPos | null,
  kind: "pressure" | "tread",
  cell: Cell,
) {
  const keyOuter: TireKey =
    side === "Left" ? "dual_left_outer" : "dual_right_outer";
  const keyInner: TireKey =
    side === "Left" ? "dual_left_inner" : "dual_right_inner";

  const assign = (bucket: TireCellGroup) => {
    if (kind === "pressure") {
      if (!bucket.pressure) bucket.pressure = cell;
      return;
    }
    if (kind === "tread") {
      if (!bucket.tread) bucket.tread = cell;
    }
  };

  // Explicit pos
  if (pos) {
    assign(row.dual[pos === "Inner" ? keyInner : keyOuter]);
    return;
  }

  // No pos: first seen -> Outer, second -> Inner (per metric type)
  const outerBucket = row.dual[keyOuter];
  const innerBucket = row.dual[keyInner];

  if (kind === "pressure") {
    if (!outerBucket.pressure) assign(outerBucket);
    else if (!innerBucket.pressure) assign(innerBucket);
    else assign(outerBucket);
    return;
  }

  if (kind === "tread") {
    if (!outerBucket.tread) assign(outerBucket);
    else if (!innerBucket.tread) assign(innerBucket);
    else assign(outerBucket);
  }
}

export default function TireGrid({
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

  const parsed = useMemo(() => {
    const byAxle = new Map<string, AxleRow>();

    const ensure = (axleLabel: string): AxleRow => {
      const existing = byAxle.get(axleLabel);
      if (existing) return existing;

      const t = normalizeAxleType(axleLabel);
      const isDual = t === "rear" || t === "trailer";

      const row: AxleRow = {
        axleLabel,
        axleType: t,
        axleOrder: axleOrder(axleLabel),
        isDual,
        single: { left: emptyGroup(), right: emptyGroup() },
        dual: makeDualMap(),
        torque: null,
      };

      byAxle.set(axleLabel, row);
      return row;
    };

    for (let idx = 0; idx < items.length; idx++) {
      const it = items[idx];
      const label = String(it.item ?? "").trim();
      if (!label) continue;

      const axleMatch = label.match(AXLE_LABEL_RE);
      if (!axleMatch?.groups?.axle) continue;

      const axleLabel = String(axleMatch.groups.axle).trim();
      const rest = String(axleMatch.groups.rest ?? "").trim();

      const row = ensure(axleLabel);

      const kind = metricKindFrom(label);
      if (kind === "other") continue;

      const unit = pickUnit(it.unit, unitHint ? unitHint(label) : "");
      const cell: Cell = {
        idx,
        label,
        unit,
        initial: String((it as any)?.value ?? (it as any)?.initial ?? ""),
        metricKind: kind,
      };

      // axle-only torque
      if (kind === "torque") {
        row.torque = row.torque ?? cell;
        continue;
      }

      // Need side for pressure/tread
      const sideRaw = rest.match(SIDE_RE)?.[1] ?? "";
      const side = sideRaw ? normalizeSide(sideRaw) : null;
      if (!side) continue;

      const dualPosRaw = rest.match(DUAL_POS_RE)?.[1] ?? "";
      const dualPos = dualPosRaw ? normalizeDualPos(dualPosRaw) : null;

      if (!row.isDual) {
        const grp = side === "Left" ? row.single.left : row.single.right;
        if (kind === "pressure" && !grp.pressure) grp.pressure = cell;
        if (kind === "tread" && !grp.tread) grp.tread = cell;
      } else {
        // kind here is pressure|tread because other/torque are handled above
        placeDualCell(row, side, dualPos, kind, cell);
      }
    }

    const rows = Array.from(byAxle.values()).sort(
      (a, b) => a.axleOrder - b.axleOrder,
    );

    const allCells: Cell[] = [];
    rows.forEach((r) => {
      if (!r.isDual) {
        [r.single.left, r.single.right].forEach((g) => {
          if (g.pressure) allCells.push(g.pressure);
          if (g.tread) allCells.push(g.tread);
        });
      } else {
        (Object.keys(r.dual) as TireKey[]).forEach((k) => {
          const g = r.dual[k];
          if (g.pressure) allCells.push(g.pressure);
          if (g.tread) allCells.push(g.tread);
        });
      }
      if (r.torque) allCells.push(r.torque);
    });

    const pressureCells = allCells.filter((c) => c.metricKind === "pressure");
    const treadCells = allCells.filter((c) => c.metricKind === "tread");

    const pressureUnit =
      unitHint?.("Tire Pressure") || bestUnitFromCells(pressureCells, "");
    const treadUnit =
      unitHint?.("Tread Depth") || bestUnitFromCells(treadCells, "");

    const existingCounts = {
      steer: rows.filter((r) => r.axleType === "steer").length,
      tag: rows.filter((r) => r.axleType === "tag").length,
      rear: rows.filter((r) => r.axleType === "rear").length,
      trailer: rows.filter((r) => r.axleType === "trailer").length,
    };

    return { rows, pressureUnit, treadUnit, existingCounts };
  }, [items, unitHint]);

  const canAdd = {
    steer: parsed.existingCounts.steer < MAX.steer,
    tag: parsed.existingCounts.tag < MAX.tag,
    rear: parsed.existingCounts.rear < MAX.rear,
    trailer: parsed.existingCounts.trailer < MAX.trailer,
  };

  const nextLabel = (t: AxleType): string => {
    if (t === "tag") return "Tag";
    const n = parsed.existingCounts[t] + 1;
    if (t === "steer") return `Steer ${n}`;
    if (t === "rear") return `Rear ${n}`;
    return `Trailer ${n}`;
  };

  const addAxle = (t: AxleType) => {
    if (!onAddAxle) return;
    if (t === "tag" && !canAdd.tag) return;
    if (t !== "tag" && !canAdd[t]) return;
    onAddAxle(nextLabel(t));
  };

  const TireInput = ({
    cell,
    placeholder,
    compact,
  }: {
    cell?: Cell;
    placeholder: string;
    compact?: boolean;
  }) => {
    const maxW = compact ? "w-[86px]" : "w-[112px]";

    if (!cell) {
      return (
        <div
          className={[
            "h-[34px] rounded-lg border border-white/10 bg-black/25",
            maxW,
          ].join(" ")}
        />
      );
    }

    return (
      <div className={`relative ${maxW}`}>
        <input
          defaultValue={cell.initial}
          className="w-full rounded-lg border border-white/10 bg-black/55 px-3 py-1.5 pr-10 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/70"
          placeholder={placeholder}
          autoComplete="off"
          inputMode="decimal"
          onBlur={(e) => commit(cell.idx, e.currentTarget.value)}
        />
        {cell.unit ? (
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 whitespace-nowrap text-[11px] text-neutral-400">
            {cell.unit}
          </span>
        ) : null}
      </div>
    );
  };

  const SingleAxleRow = ({ row }: { row: AxleRow }) => {
    const L = row.single.left;
    const R = row.single.right;

    return (
      <div className="flex items-center justify-center gap-4">
        <div className="flex flex-col items-center gap-2">
          <TireInput cell={L.tread} placeholder="TD" />
          <TireInput cell={L.pressure} placeholder="TP" />
        </div>

        <div className="h-[64px] w-[140px] rounded-xl border border-white/10 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] shadow-[0_18px_45px_rgba(0,0,0,0.65)]" />

        <div className="flex flex-col items-center gap-2">
          <TireInput cell={R.tread} placeholder="TD" />
          <TireInput cell={R.pressure} placeholder="TP" />
        </div>
      </div>
    );
  };

  const DualAxleRow = ({ row }: { row: AxleRow }) => {
    const LO = row.dual.dual_left_outer;
    const LI = row.dual.dual_left_inner;
    const RI = row.dual.dual_right_inner;
    const RO = row.dual.dual_right_outer;

    const DualStack = ({ a, b }: { a: TireCellGroup; b: TireCellGroup }) => (
      <div className="flex items-center gap-2">
        <div className="flex flex-col items-center gap-2">
          <TireInput cell={a.tread} placeholder="TD" compact />
          <TireInput cell={a.pressure} placeholder="TP" compact />
        </div>
        <div className="flex flex-col items-center gap-2">
          <TireInput cell={b.tread} placeholder="TD" compact />
          <TireInput cell={b.pressure} placeholder="TP" compact />
        </div>
      </div>
    );

    return (
      <div className="flex items-center justify-center gap-4">
        <DualStack a={LO} b={LI} />

        <div className="h-[64px] w-[140px] rounded-xl border border-white/10 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] shadow-[0_18px_45px_rgba(0,0,0,0.65)]" />

        <div className="flex items-center gap-2">
          <div className="flex flex-col items-center gap-2">
            <TireInput cell={RI.tread} placeholder="TD" compact />
            <TireInput cell={RI.pressure} placeholder="TP" compact />
          </div>
          <div className="flex flex-col items-center gap-2">
            <TireInput cell={RO.tread} placeholder="TD" compact />
            <TireInput cell={RO.pressure} placeholder="TP" compact />
          </div>
        </div>
      </div>
    );
  };

  const showEmptyState = parsed.rows.length === 0;

  return (
    <div className="grid w-full gap-3">
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="flex flex-col gap-1">
          <div
            className="text-base font-semibold uppercase tracking-[0.18em] text-orange-300"
            style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}
          >
            Tire Measurements
          </div>

          {(parsed.pressureUnit || parsed.treadUnit) && (
            <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-400">
              {parsed.pressureUnit ? `Pressure: ${parsed.pressureUnit}` : null}
              {parsed.pressureUnit && parsed.treadUnit ? " • " : null}
              {parsed.treadUnit ? `Tread: ${parsed.treadUnit}` : null}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-full border border-white/10 bg-black/55 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-100 hover:border-orange-500/70 hover:bg-black/70"
          aria-expanded={open}
          title={open ? "Collapse" : "Expand"}
          tabIndex={-1}
        >
          {open ? "Collapse" : "Expand"}
        </button>
      </div>

      {onAddAxle ? (
        <div className="flex flex-wrap items-center gap-2 px-1">
          <button
            type="button"
            onClick={() => addAxle("steer")}
            disabled={!canAdd.steer}
            className="rounded-full border border-white/10 bg-black/55 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-100 hover:border-orange-500/70 hover:bg-black/70 disabled:opacity-40"
          >
            + Steer
          </button>
          <button
            type="button"
            onClick={() => addAxle("tag")}
            disabled={!canAdd.tag}
            className="rounded-full border border-white/10 bg-black/55 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-100 hover:border-orange-500/70 hover:bg-black/70 disabled:opacity-40"
          >
            + Tag
          </button>
          <button
            type="button"
            onClick={() => addAxle("rear")}
            disabled={!canAdd.rear}
            className="rounded-full border border-white/10 bg-black/55 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-100 hover:border-orange-500/70 hover:bg-black/70 disabled:opacity-40"
          >
            + Rear axle (duals)
          </button>
          <button
            type="button"
            onClick={() => addAxle("trailer")}
            disabled={!canAdd.trailer}
            className="rounded-full border border-white/10 bg-black/55 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-100 hover:border-orange-500/70 hover:bg-black/70 disabled:opacity-40"
          >
            + Trailer axle (4 tires)
          </button>

          <div className="ml-auto text-[10px] uppercase tracking-[0.16em] text-neutral-500">
            {parsed.existingCounts.steer}/{MAX.steer} steer •{" "}
            {parsed.existingCounts.tag}/{MAX.tag} tag •{" "}
            {parsed.existingCounts.rear}/{MAX.rear} rear •{" "}
            {parsed.existingCounts.trailer}/{MAX.trailer} trailer
          </div>
        </div>
      ) : null}

      {open ? (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/55 shadow-[0_18px_45px_rgba(0,0,0,0.85)] backdrop-blur-xl">
          {showEmptyState ? (
            <div className="px-4 py-5 text-center md:px-6 md:py-6">
              <div className="text-sm font-semibold text-neutral-200">
                No axles added yet.
              </div>
              <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-neutral-400">
                Use the buttons above to add Steer / Tag / Rear / Trailer axles.
              </div>
            </div>
          ) : (
            <div className="grid gap-6 px-4 py-4 md:px-6 md:py-5">
              {parsed.rows.map((row) => (
                <div key={row.axleLabel} className="grid gap-3">
                  <div className="text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
                    {row.axleLabel}
                  </div>

                  {row.isDual ? (
                    <DualAxleRow row={row} />
                  ) : (
                    <SingleAxleRow row={row} />
                  )}

                  {row.torque ? (
                    <div className="mt-1 flex items-center justify-center gap-2">
                      <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">
                        Wheel Torque
                      </span>
                      <div className="w-[160px]">
                        <TireInput cell={row.torque} placeholder="Torque" />
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}