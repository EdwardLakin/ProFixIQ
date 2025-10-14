"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useInspectionForm } from "@inspections/lib/inspection/ui/InspectionFormContext";
import type { InspectionItem } from "@inspections/lib/inspection/types";

type PressureUnit = "psi" | "kpa";

type Props = {
  sectionIndex: number;
  items: InspectionItem[];

  /** Optional hint used when a row/unit is blank */
  unitHint?: (label: string) => string;

  /** Optional: show Add Axle control and handle the selected axle */
  onAddAxle?: (axleLabel: string) => void;

  /**
   * Primary pressure unit in UI. Value is still stored in `item.value` as typed;
   * we only decorate UI with units/mini conversion.
   * Default: "psi"
   */
  pressurePrimary?: PressureUnit;

  /**
   * Show the tiny converted unit next to pressures. e.g. “(248 kPa)”
   * Default: true
   */
  showPressureSecondary?: boolean;

  /**
   * Optional: Override metric ordering. Unknown metrics fall to the end.
   * Defaults are sensible for both air & hydraulic.
   */
  metricOrder?: string[];
};

/** --- Helpers --- */
const PSI_TO_KPA = 6.8947572932;
const toKpa = (psiNum: number) => Math.round(psiNum * PSI_TO_KPA);
const isPressureMetric = (name: string) => /pressure/i.test(name);

/**
 * Detects style:
 *  - Air-style axle labels: "Steer 1 Left Tread Depth" / "Drive 2 Right Push Rod Travel"
 *  - Hydraulic-style corners: "LF Tire Pressure", "Left Front Rotor Thickness"
 */
const AIR_RE = /^(?<axle>.+?)\s+(?<side>Left|Right)\s+(?<metric>.+)$/i;
const CORNER_ABBR_RE = /^(?<corner>LF|RF|LR|RR)\s+(?<metric>.+)$/i;
const CORNER_FULL_RE = /^(?<corner>(Left|Right)\s+(Front|Rear))\s+(?<metric>.+)$/i;

type Side = "Left" | "Right";
type CornerKey = "LF" | "RF" | "LR" | "RR";
const CornerTitle: Record<CornerKey, string> = {
  LF: "Left Front",
  RF: "Right Front",
  LR: "Left Rear",
  RR: "Right Rear",
};
const normalizeCorner = (raw: string): CornerKey | null => {
  const s = raw.toLowerCase();
  if (s.startsWith("lf") || s === "left front") return "LF";
  if (s.startsWith("rf") || s === "right front") return "RF";
  if (s.startsWith("lr") || s === "left rear") return "LR";
  if (s.startsWith("rr") || s === "right rear") return "RR";
  return null;
};

/** Default ordering covers both modes (air/hydraulic) */
const DEFAULT_METRIC_ORDER = [
  "Tire Pressure",
  "Tread Depth",
  "Tire Tread",
  "Pad Thickness",
  "Lining/Shoe",
  "Rotor",
  "Drum/Rotor",
  "Push Rod",
  "Wheel Torque",
];

/** ------------------------------ Component ------------------------------ */
export default function HybridCornerGrid({
  sectionIndex,
  items,
  unitHint,
  onAddAxle,
  pressurePrimary = "psi",
  showPressureSecondary = true,
  metricOrder = DEFAULT_METRIC_ORDER,
}: Props) {
  const { updateItem } = useInspectionForm();

  /** Sort helper */
  const orderIndex = (metric: string) => {
    const i = metricOrder.findIndex((m) => metric.toLowerCase().includes(m.toLowerCase()));
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };

  /** Decide rendering mode from items */
  const mode: "air-axle" | "hydraulic-corner" = useMemo(() => {
    for (const it of items) {
      const label = it.item ?? "";
      if (AIR_RE.test(label)) return "air-axle";
      if (CORNER_ABBR_RE.test(label) || CORNER_FULL_RE.test(label)) return "hydraulic-corner";
    }
    // Fallback: if nothing matches, default to hydraulic-corner so users at least see 4 boxes
    return "hydraulic-corner";
  }, [items]);

  /** ----------------- Local buffered values (debounced writes) ----------------- */
  const [localVals, setLocalVals] = useState<Record<number, string>>({});
  const timersRef = useRef<Record<number, number | NodeJS.Timeout>>({});

  useEffect(() => {
    const seed: Record<number, string> = {};
    items.forEach((it, idx) => (seed[idx] = String(it.value ?? "")));
    setLocalVals(seed);
  }, [items]);

  const setBuffered = (idx: number, value: string) => {
    setLocalVals((prev) => ({ ...prev, [idx]: value }));
    const t = timersRef.current[idx];
    if (t) clearTimeout(t as number);
    timersRef.current[idx] = setTimeout(() => {
      updateItem(sectionIndex, idx, { value });
    }, 250);
  };

  /** ----------------- AIR (Axle) grouping ----------------- */
  type MetricCell = {
    metric: string;
    idx?: number;
    val?: string | number | null;
    unit?: string | null;
    fullLabel: string;
  };
  type SideCard = { side: Side; rows: MetricCell[] };
  type AxleGroup = { axle: string; left: SideCard; right: SideCard };

  const axleGroups: AxleGroup[] = useMemo(() => {
    if (mode !== "air-axle") return [];
    const map = new Map<string, { Left: Map<string, MetricCell>; Right: Map<string, MetricCell> }>();

    items.forEach((it, idx) => {
      const label = it.item ?? "";
      const m = label.match(AIR_RE);
      if (!m?.groups) return;

      const axle = m.groups.axle.trim();
      const side = m.groups.side as Side;
      const metric = m.groups.metric.trim();

      const bucket = map.get(axle) ?? { Left: new Map(), Right: new Map() };
      const sideMap = bucket[side];
      const existing =
        sideMap.get(metric) ??
        ({
          metric,
          fullLabel: label,
        } as MetricCell);

      existing.idx = idx;
      existing.val = it.value ?? "";
      existing.unit = it.unit ?? (unitHint ? unitHint(label) : "");

      sideMap.set(metric, existing);
      map.set(axle, bucket);
    });

    return Array.from(map.entries()).map(([axle, sides]) => {
      const leftRows = Array.from(sides.Left.values()).sort((a, b) => orderIndex(a.metric) - orderIndex(b.metric));
      const rightRows = Array.from(sides.Right.values()).sort((a, b) => orderIndex(a.metric) - orderIndex(b.metric));
      return { axle, left: { side: "Left", rows: leftRows }, right: { side: "Right", rows: rightRows } };
    });
  }, [items, unitHint, mode]);

  /** ----------------- HYDRAULIC (Corner) grouping ----------------- */
  type CornerRow = {
    idx: number;
    metric: string;
    unit?: string | null;
    fullLabel: string;
  };
  type CornerGroup = { corner: CornerKey; rows: CornerRow[] };

  const cornerGroups: CornerGroup[] = useMemo(() => {
    if (mode !== "hydraulic-corner") return [];
    const base: Record<CornerKey, CornerRow[]> = { LF: [], RF: [], LR: [], RR: [] };

    items.forEach((it, idx) => {
      const label = it.item ?? "";
      let corner: CornerKey | null = null;
      let metric = "";

      const m1 = label.match(CORNER_ABBR_RE);
      if (m1?.groups) {
        corner = normalizeCorner(m1.groups.corner);
        metric = m1.groups.metric.trim();
      } else {
        const m2 = label.match(CORNER_FULL_RE);
        if (m2?.groups) {
          corner = normalizeCorner(m2.groups.corner);
          metric = m2.groups.metric.trim();
        }
      }
      if (!corner) return;

      base[corner].push({
        idx,
        metric,
        unit: it.unit ?? (unitHint ? unitHint(label) : ""),
        fullLabel: label,
      });
    });

    const build = (ck: CornerKey): CornerGroup => ({
      corner: ck,
      rows: base[ck].sort((a, b) => orderIndex(a.metric) - orderIndex(b.metric)),
    });

    return [build("LF"), build("RF"), build("LR"), build("RR")];
  }, [items, unitHint, mode]);

  /** ----------------- Shared UI bits ----------------- */
  const PressureBadge = ({ val, unit }: { val: string; unit: PressureUnit }) => {
    const num = Number(val);
    if (!showPressureSecondary || Number.isNaN(num)) return null;
    if (unit === "psi") {
      const kpa = toKpa(num);
      return <span className="ml-2 text-[10px] text-zinc-400">({kpa} kPa)</span>;
    } else {
      // primary kPa -> show tiny psi
      const psi = Math.round((num / PSI_TO_KPA) * 10) / 10;
      return <span className="ml-2 text-[10px] text-zinc-400">({psi} psi)</span>;
    }
  };

  const renderValueRow = (
    idx: number | undefined,
    metric: string,
    unitFromItemOrHint: string | null | undefined,
    fullLabel: string,
  ) => {
    const value = idx != null ? localVals[idx] ?? "" : "";
    const unit = unitFromItemOrHint ?? (unitHint ? unitHint(fullLabel) : "");

    return (
      <div className="grid grid-cols-[1fr_auto] items-center gap-2">
        <div className="flex items-center">
          <input
            className="w-full rounded border border-zinc-800 bg-zinc-800/60 px-2 py-1 text-white"
            style={{ fontFamily: "Roboto, system-ui, sans-serif" }}
            value={value}
            onChange={(e) => {
              if (idx != null) setBuffered(idx, e.target.value);
            }}
            placeholder="Value"
            inputMode="decimal"
          />
          {isPressureMetric(metric) && (
            <PressureBadge val={value} unit={pressurePrimary} />
          )}
        </div>
        <div className="text-center text-xs text-zinc-400">
          {/* Show primary unit label; leave item.unit untouched */}
          {isPressureMetric(metric) ? (pressurePrimary === "psi" ? "psi" : "kPa") : unit}
        </div>
      </div>
    );
  };

  const MetricCardShell = ({
    title,
    children,
  }: {
    title: string;
    children: React.ReactNode;
  }) => (
    <div className="rounded bg-zinc-950/70 p-3">
      <div
        className="mb-2 text-sm font-semibold text-orange-300"
        style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}
      >
        {title}
      </div>
      {children}
    </div>
  );

  const SideCardView = ({ side, rows }: { side: Side; rows: MetricCell[] }) => (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
      <div
        className="mb-2 font-semibold text-orange-400"
        style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}
      >
        {side}
      </div>

      <div className="space-y-3">
        {rows.map((row) => (
          <MetricCardShell key={row.metric} title={row.metric}>
            {renderValueRow(row.idx, row.metric, row.unit, row.fullLabel)}
          </MetricCardShell>
        ))}
      </div>
    </div>
  );

  const CornerCard = ({ group }: { group: CornerGroup }) => (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
      <div
        className="mb-2 font-semibold text-orange-400"
        style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}
      >
        {CornerTitle[group.corner]}
      </div>

      <div className="space-y-3">
        {group.rows.map((row) => (
          <MetricCardShell key={`${group.corner}-${row.idx}-${row.metric}`} title={row.metric}>
            {renderValueRow(row.idx, row.metric, row.unit, row.fullLabel)}
          </MetricCardShell>
        ))}
      </div>
    </div>
  );

  /** Add-axle picker (for air-style pages) */
  const existingAxles = useMemo(() => axleGroups.map((g) => g.axle), [axleGroups]);
  const [pendingAxle, setPendingAxle] = useState<string>("");

  const candidateAxles = useMemo(() => {
    const wants: string[] = [];
    for (let i = 1; i <= 2; i++) wants.push(`Steer ${i}`);
    for (let i = 1; i <= 4; i++) wants.push(`Drive ${i}`);
    wants.push("Tag", "Trailer 1", "Trailer 2", "Trailer 3");
    return wants.filter((l) => !existingAxles.includes(l));
  }, [existingAxles]);

  /** ------------------------------ Render ------------------------------ */
  return (
    <div className="grid gap-4">
      {/* Add Axle control only shown when provided AND we’re in axle mode */}
      {onAddAxle && mode === "air-axle" && (
        <div className="flex items-center gap-2">
          <select
            className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-sm text-white"
            value={pendingAxle}
            onChange={(e) => setPendingAxle(e.target.value)}
          >
            <option value="">Add axle…</option>
            {candidateAxles.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
          <button
            className="rounded bg-orange-600 px-3 py-1 text-sm font-semibold text-black hover:bg-orange-500 disabled:opacity-40"
            onClick={() => pendingAxle && onAddAxle(pendingAxle)}
            disabled={!pendingAxle}
          >
            + Add
          </button>
        </div>
      )}

      {mode === "air-axle" ? (
        axleGroups.map((group) => (
          <div key={group.axle} className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
            <div
              className="mb-3 text-lg font-semibold text-orange-400"
              style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}
            >
              {group.axle}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <SideCardView side="Left" rows={group.left.rows} />
              <SideCardView side="Right" rows={group.right.rows} />
            </div>
          </div>
        ))
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <CornerCard group={cornerGroups[0]} /> {/* LF */}
            <CornerCard group={cornerGroups[1]} /> {/* RF */}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <CornerCard group={cornerGroups[2]} /> {/* LR */}
            <CornerCard group={cornerGroups[3]} /> {/* RR */}
          </div>
        </>
      )}
    </div>
  );
}