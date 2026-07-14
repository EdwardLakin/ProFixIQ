// features/inspections/lib/inspection/ui/TireGridHydraulic.tsx
"use client";

import { useMemo, useState } from "react";
import { useInspectionForm } from "@inspections/lib/inspection/ui/InspectionFormContext";
import type {
  InspectionItem,
} from "@inspections/lib/inspection/types";

type PartLine = { description: string; qty: number };

type SmartInspectionMatch = {
  id: string;
  label: string;
  complaint?: string | null;
  correction?: string | null;
  laborHours?: number | null;
  parts?: Array<{ name: string; qty?: number }>;
  score?: number | null;
  confidence?: number | null;
  menuItemId?: string | null;
  menuRepairItemId?: string | null;
};


type Props = {
  sectionIndex: number;
  items: InspectionItem[];
  unitHint?: (label: string) => string;
  onSpecHint?: (metricLabel: string) => void;

  /** FAIL/REC support (mirrors SectionDisplay) */
  requireNoteForAI?: boolean;
  onSubmitAI?: (sectionIndex: number, itemIndex: number) => void;
  isSubmittingAI?: (sectionIndex: number, itemIndex: number) => boolean;
  onSmartMatchNoteChange?: (
    sectionIndex: number,
    itemIndex: number,
    note: string,
  ) => void;

  smartMatchByKey?: Record<string, SmartInspectionMatch | null>;
  smartMatchLoadingByKey?: Record<string, boolean>;
  onAcceptSmartMatch?: (sectionIndex: number, itemIndex: number) => void;
  onDismissSmartMatch?: (sectionIndex: number, itemIndex: number) => void;

  onUpdateParts?: (
    sectionIndex: number,
    itemIndex: number,
    parts: PartLine[],
  ) => void;

  onUpdateLaborHours?: (
    sectionIndex: number,
    itemIndex: number,
    hours: number | null,
  ) => void;
};



type Side = "Left" | "Right";
type DualPos = "Inner" | "Outer";
type MetricKind =
  | "pressure"
  | "pressureOuter"
  | "pressureInner"
  | "tread"
  | "treadOuter"
  | "treadInner"
  | "condition"
  | "status"
  | "other";

type Cell = {
  idx: number;
  label: string;
  unit: string;
};

type SingleSide = {
  pressure?: Cell;
  tread?: Cell;
  condition?: Cell;
};

type DualSide = {
  pressure?: Cell; // if only one TP is provided for a dual side
  pressureOuter?: Cell;
  pressureInner?: Cell;

  tread?: Cell; // if only one TD is provided for a dual side
  treadOuter?: Cell;
  treadInner?: Cell;

  condition?: Cell;
};

type AxleRow = {
  axle: string;
  isDual: boolean;
  single: { left: SingleSide; right: SingleSide };
  dual: { left: DualSide; right: DualSide };

  /** Optional row-level status carrier (fallback). */
  statusCell?: Cell;
};

const AXLE_LABEL_RE = /^(?<axle>.+?)\s+(?<side>Left|Right)\s+(?<metric>.+)$/i;
const HYD_CORNER_RE = /^(?<corner>LF|RF|LR|RR)\s+(?<metric>.+)$/i;

type HydCorner = "LF" | "RF" | "LR" | "RR";

function cornerToAxleSide(corner: HydCorner): { axleLabel: string; side: Side } {
  switch (corner) {
    case "LF":
      return { axleLabel: "Steer 1", side: "Left" };
    case "RF":
      return { axleLabel: "Steer 1", side: "Right" };
    case "LR":
      return { axleLabel: "Rear 1", side: "Left" };
    case "RR":
      return { axleLabel: "Rear 1", side: "Right" };
  }
}

function metricKindFrom(label: string): MetricKind {
  const l = label.toLowerCase().trim();

  if (l.includes("tire status") || l.includes("tyre status")) return "status";

  if (
    l.includes("tire condition") ||
    l.includes("tyre condition") ||
    /\bcondition\b/i.test(l)
  ) {
    return "condition";
  }

  if (l.includes("tire pressure") || l.includes("tyre pressure") || l.includes("pressure")) {
    if (l.includes("outer")) return "pressureOuter";
    if (l.includes("inner")) return "pressureInner";
    return "pressure";
  }

  if (l.includes("tread depth") || l.includes("tread") || l.includes("tire tread") || l.includes("tyre tread")) {
    if (l.includes("outer")) return "treadOuter";
    if (l.includes("inner")) return "treadInner";
    return "tread";
  }

  return "other";
}

function extractPos(metricLabel: string): DualPos | null {
  const l = metricLabel.toLowerCase();
  if (l.includes("outer")) return "Outer";
  if (l.includes("inner")) return "Inner";
  return null;
}

function pickUnit(explicit: string | null | undefined, hinted: string | null | undefined): string {
  const e = (explicit ?? "").trim();
  if (e) return e;
  return (hinted ?? "").trim();
}

function isDualAxleLabel(axle: string): boolean {
  const l = axle.toLowerCase();
  if (l.startsWith("steer")) return false;
  if (l.startsWith("drive")) return true;
  if (l.startsWith("rear")) return true;
  if (l.startsWith("tag")) return true;
  if (l.startsWith("trailer")) return true;
  return true;
}

function placeDualTread(side: DualSide, kind: MetricKind, metricLabel: string, cell: Cell): void {
  if (kind === "treadOuter") {
    if (!side.treadOuter) side.treadOuter = cell;
    return;
  }
  if (kind === "treadInner") {
    if (!side.treadInner) side.treadInner = cell;
    return;
  }
  if (kind === "tread") {
    if (!side.tread) side.tread = cell;
    return;
  }

  const pos = extractPos(metricLabel);
  if (pos === "Outer") {
    if (!side.treadOuter) side.treadOuter = cell;
    return;
  }
  if (pos === "Inner") {
    if (!side.treadInner) side.treadInner = cell;
    return;
  }

  if (!side.treadOuter) side.treadOuter = cell;
  else if (!side.treadInner) side.treadInner = cell;
}

function placeDualPressure(side: DualSide, kind: MetricKind, metricLabel: string, cell: Cell): void {
  if (kind === "pressureOuter") {
    if (!side.pressureOuter) side.pressureOuter = cell;
    return;
  }
  if (kind === "pressureInner") {
    if (!side.pressureInner) side.pressureInner = cell;
    return;
  }
  if (kind === "pressure") {
    if (!side.pressure) side.pressure = cell;
    return;
  }

  const pos = extractPos(metricLabel);
  if (pos === "Outer") {
    if (!side.pressureOuter) side.pressureOuter = cell;
    return;
  }
  if (pos === "Inner") {
    if (!side.pressureInner) side.pressureInner = cell;
    return;
  }

  if (!side.pressure) side.pressure = cell;
}

function scoreAxle(ax: string): number {
  const l = ax.toLowerCase();
  if (l.startsWith("steer")) return 0;
  if (l.startsWith("drive")) return 1;
  if (l.startsWith("rear")) return 2;
  if (l.startsWith("tag")) return 3;
  if (l.startsWith("trailer")) return 4;
  return 9;
}

function getLabel(it: InspectionItem): string {
  const anyIt = it as unknown as { item?: unknown; name?: unknown };
  return String(anyIt.item ?? anyIt.name ?? "").trim();
}

function getExplicitUnit(it: InspectionItem): string | null {
  const anyIt = it as unknown as { unit?: unknown };
  const u = anyIt.unit;
  if (typeof u === "string") return u;
  if (u === null) return null;
  return null;
}

function getValue(it: InspectionItem): string {
  const anyIt = it as unknown as { value?: unknown };
  const v = anyIt.value;
  return typeof v === "string" || typeof v === "number" ? String(v) : "";
}


function inputCls() {
  return [
    "h-[34px] w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)]",
    "px-3 py-1.5 text-sm text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)]",
    "focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/70",
    "disabled:opacity-50 disabled:cursor-not-allowed",
  ].join(" ");
}

function unitCls() {
  return "pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-[color:var(--theme-text-secondary)]";
}

function cornerShellCls() {
  return "rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] shadow-[var(--theme-shadow-medium)] backdrop-blur-xl";
}

function axleTitleCls() {
  return "text-sm font-semibold uppercase tracking-[0.18em] text-[color:var(--accent-copper,#f97316)]";
}

function tinyLabelCls() {
  return "mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]";
}

export default function TireGridHydraulic(props: Props) {
  const {
    sectionIndex,
    items,
    unitHint,
  } = props;

  const { updateItem } = useInspectionForm();
  const [open, setOpen] = useState(true);

  const commitValue = (idx: number, value: string) => {
    updateItem(sectionIndex, idx, { value });
  };


  const tables = useMemo<AxleRow[]>(() => {
    const byAxle = new Map<string, AxleRow>();

    const ensure = (axle: string): AxleRow => {
      const existing = byAxle.get(axle);
      if (existing) return existing;

      const next: AxleRow = {
        axle,
        isDual: isDualAxleLabel(axle),
        single: { left: {}, right: {} },
        dual: { left: {}, right: {} },
      };
      byAxle.set(axle, next);
      return next;
    };

    items.forEach((it, idx) => {
      const label = getLabel(it);
      if (!label) return;

      const hintedUnit = unitHint ? unitHint(label) : "";
      const unit = pickUnit(getExplicitUnit(it), hintedUnit);

      // Global "Tire Status" items (not axle/corner formatted) -> assign to Steer/Rear heuristic
      const kindLoose = metricKindFrom(label);
      if (kindLoose === "status" && !AXLE_LABEL_RE.test(label) && !HYD_CORNER_RE.test(label)) {
        const l = label.toLowerCase();
        const axleLabel =
          l.includes("rear") ? "Rear 1" : l.includes("front") || l.includes("steer") ? "Steer 1" : "Rear 1";
        const row = ensure(axleLabel);
        if (!row.statusCell) row.statusCell = { idx, label, unit };
        return;
      }

      // 1) Hydraulic corner style: "LF Tire Pressure", "LR Tread Depth (Inner)", "RR Tire Condition"
      const hyd = label.match(HYD_CORNER_RE);
      if (hyd?.groups?.corner && hyd.groups.metric) {
        const corner = String(hyd.groups.corner).toUpperCase() as HydCorner;
        const metric = String(hyd.groups.metric).trim();
        const { axleLabel, side } = cornerToAxleSide(corner);

        const kind = metricKindFrom(metric);
        if (kind === "other") return;

        const row = ensure(axleLabel);
        row.isDual = isDualAxleLabel(axleLabel);

        const cell: Cell = { idx, label, unit };

        if (kind === "status") {
          if (!row.statusCell) row.statusCell = cell;
          return;
        }

        if (!row.isDual) {
  const grp = side === "Left" ? row.single.left : row.single.right;

  if (kind === "condition" && !grp.condition) grp.condition = cell;

  if (
    (kind === "pressure" || kind === "pressureOuter" || kind === "pressureInner") &&
    !grp.pressure
  ) {
    grp.pressure = cell;
  }

  if (
    (kind === "tread" || kind === "treadOuter" || kind === "treadInner") &&
    !grp.tread
  ) {
    grp.tread = cell;
  }

  return;
}

        const grp = side === "Left" ? row.dual.left : row.dual.right;
        if (kind === "condition" && !grp.condition) grp.condition = cell;
        if (kind === "pressure" || kind === "pressureOuter" || kind === "pressureInner") {
          placeDualPressure(grp, kind, metric, cell);
        }
        if (kind === "tread" || kind === "treadOuter" || kind === "treadInner") {
          placeDualTread(grp, kind, metric, cell);
        }
        return;
      }

      // 2) Axle style: "Steer 1 Left Tread Depth (Outer)", "Steer 1 Right Tire Condition"
      const m = label.match(AXLE_LABEL_RE);
      if (!m?.groups) return;

      const axle = String(m.groups.axle ?? "").trim();
      const side = (String(m.groups.side ?? "") as Side) || "Left";
      const metric = String(m.groups.metric ?? "").trim();
      if (!axle || !metric) return;

      const kind = metricKindFrom(metric);
      if (kind === "other") return;

      const row = ensure(axle);
      row.isDual = isDualAxleLabel(axle);

      const cell: Cell = { idx, label, unit };

      if (kind === "status") {
        if (!row.statusCell) row.statusCell = cell;
        return;
      }

      if (!row.isDual) {
  const grp = side === "Left" ? row.single.left : row.single.right;

  if (kind === "condition" && !grp.condition) grp.condition = cell;

  if (
    (kind === "pressure" || kind === "pressureOuter" || kind === "pressureInner") &&
    !grp.pressure
  ) {
    grp.pressure = cell;
  }

  if (
    (kind === "tread" || kind === "treadOuter" || kind === "treadInner") &&
    !grp.tread
  ) {
    grp.tread = cell;
  }

  return;
}


      const grp = side === "Left" ? row.dual.left : row.dual.right;
      if (kind === "condition" && !grp.condition) grp.condition = cell;
      if (kind === "pressure" || kind === "pressureOuter" || kind === "pressureInner") {
        placeDualPressure(grp, kind, metric, cell);
      }
      if (kind === "tread" || kind === "treadOuter" || kind === "treadInner") {
        placeDualTread(grp, kind, metric, cell);
      }
    });

    const out = Array.from(byAxle.values());
    out.sort((a, b) => {
      const sa = scoreAxle(a.axle);
      const sb = scoreAxle(b.axle);
      if (sa !== sb) return sa - sb;
      return a.axle.localeCompare(b.axle);
    });

    return out;
  }, [items, unitHint]);

  if (tables.length === 0) return null;

  const valOf = (c?: Cell) => (c ? getValue(items[c.idx]!) : "");

  const renderMeasureRow = (
    leftLabel: string,
    leftCell?: Cell,
    rightLabel?: string,
    rightCell?: Cell,
    unitFallback = "psi",
  ) => {
    const U = (c?: Cell) => (c?.unit ?? "").trim() || unitFallback;
    const isInches = (u: string) => u.toLowerCase() === "in" || u.toLowerCase() === "inch" || u === '"';
    const isText = (c?: Cell) => isInches(U(c));
    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="grid grid-cols-[100px_minmax(0,1fr)] items-center gap-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]">{leftLabel}</div>
          <div className="relative">
            <input value={leftCell ? valOf(leftCell) : ""} className={inputCls()} placeholder={leftCell ? "Value" : "—"} inputMode={isText(leftCell) ? "text" : "decimal"} type={isText(leftCell) ? "text" : "number"} onChange={(e) => leftCell && commitValue(leftCell.idx, e.currentTarget.value)} disabled={!leftCell} />
            <span className={unitCls()}>{U(leftCell)}</span>
          </div>
        </div>
        {rightLabel ? (
          <div className="grid grid-cols-[100px_minmax(0,1fr)] items-center gap-2">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]">{rightLabel}</div>
            <div className="relative">
              <input value={rightCell ? valOf(rightCell) : ""} className={inputCls()} placeholder={rightCell ? "Value" : "—"} inputMode={isText(rightCell) ? "text" : "decimal"} type={isText(rightCell) ? "text" : "number"} onChange={(e) => rightCell && commitValue(rightCell.idx, e.currentTarget.value)} disabled={!rightCell} />
              <span className={unitCls()}>{U(rightCell)}</span>
            </div>
          </div>
        ) : null}
      </div>
    );
  };


  const StatusOrConditions = (_t: AxleRow) => {
    // TODO(ai): render threshold-based recommendation hints in detail findings sections, not measurement grids.
    return null;
  };

    return (
    <div className="grid w-full gap-3">
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]">
          Tire Grid – Hydraulic
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-primary)] hover:border-orange-500/70 hover:bg-[color:var(--theme-surface-overlay)]"
          aria-expanded={open}
          title={open ? "Collapse" : "Expand"}
          tabIndex={-1}
        >
          {open ? "Collapse" : "Expand"}
        </button>
      </div>

      {open ? (
        <div className="grid gap-4">
          {tables.map((t) => {
            const isDual = t.isDual;

            const leftTD = isDual
              ? { outer: t.dual.left.treadOuter ?? t.dual.left.tread, inner: t.dual.left.treadInner }
              : { single: t.single.left.tread };

            const rightTD = isDual
              ? { outer: t.dual.right.treadOuter ?? t.dual.right.tread, inner: t.dual.right.treadInner }
              : { single: t.single.right.tread };

            const leftTP = isDual
              ? {
                  pressure: t.dual.left.pressure,
                  pressureOuter: t.dual.left.pressureOuter,
                  pressureInner: t.dual.left.pressureInner,
                }
              : { pressure: t.single.left.pressure };

            const rightTP = isDual
              ? {
                  pressure: t.dual.right.pressure,
                  pressureOuter: t.dual.right.pressureOuter,
                  pressureInner: t.dual.right.pressureInner,
                }
              : { pressure: t.single.right.pressure };

            return (
              <div key={t.axle} className={["p-4", cornerShellCls()].join(" ")}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className={axleTitleCls()} style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}>
                    {t.axle}
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
                    TP / TD capture only
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <div className={tinyLabelCls()}>Tread Depth</div>
                    <div className="space-y-2 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-2.5">
                      {isDual
                        ? (
                          <>
                            {renderMeasureRow("Left Outer", leftTD.outer, "Right Outer", rightTD.outer, "mm")}
                            {renderMeasureRow("Left Inner", leftTD.inner, "Right Inner", rightTD.inner, "mm")}
                          </>
                        )
                        : renderMeasureRow("Left", leftTD.single, "Right", rightTD.single, "mm")}
                    </div>
                  </div>
                  <div>
                    <div className={tinyLabelCls()}>Pressure</div>
                    <div className="space-y-2 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-2.5">
                      {isDual
                        ? (
                          <>
                            {renderMeasureRow("Left Outer", leftTP.pressureOuter ?? leftTP.pressure, "Right Outer", rightTP.pressureOuter ?? rightTP.pressure, "psi")}
                            {renderMeasureRow("Left Inner", leftTP.pressureInner, "Right Inner", rightTP.pressureInner, "psi")}
                          </>
                        )
                        : renderMeasureRow("Left", leftTP.pressure, "Right", rightTP.pressure, "psi")}
                    </div>
                  </div>
                </div>

                {StatusOrConditions(t)}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
