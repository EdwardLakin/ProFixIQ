// features/inspections/lib/inspection/ui/TireGridHydraulic.tsx
"use client";

import { useMemo, useState } from "react";
import { useInspectionForm } from "@inspections/lib/inspection/ui/InspectionFormContext";
import type {
  InspectionItem,
  InspectionItemStatus,
} from "@inspections/lib/inspection/types";
import StatusButtons from "@inspections/lib/inspection/StatusButtons";
import { Button } from "@shared/components/ui/Button";

type PartLine = { description: string; qty: number };

type Props = {
  sectionIndex: number;
  items: InspectionItem[];
  unitHint?: (label: string) => string;
  onSpecHint?: (metricLabel: string) => void;

  /** FAIL/REC support (mirrors SectionDisplay) */
  requireNoteForAI?: boolean;
  onSubmitAI?: (sectionIndex: number, itemIndex: number) => void;
  isSubmittingAI?: (sectionIndex: number, itemIndex: number) => boolean;

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

function getNotes(it: InspectionItem): string {
  const anyIt = it as unknown as { notes?: unknown; note?: unknown };
  return String(anyIt.notes ?? anyIt.note ?? "");
}

function getStatus(it: InspectionItem): string {
  const anyIt = it as unknown as { status?: unknown };
  return String(anyIt.status ?? "").toLowerCase();
}

function readParts(it: InspectionItem): PartLine[] {
  const anyIt = it as unknown as { parts?: unknown };
  if (!Array.isArray(anyIt.parts)) return [];
  return anyIt.parts
    .map((p) => {
      const obj = p as { description?: unknown; qty?: unknown };
      const description = String(obj.description ?? "");
      const qty = Number(obj.qty ?? 0);
      return { description, qty };
    })
    .filter((p) => p.description.trim().length > 0 || p.qty > 0);
}

function readLaborHours(it: InspectionItem): number | null {
  const anyIt = it as unknown as { laborHours?: unknown };
  if (typeof anyIt.laborHours === "number" && !Number.isNaN(anyIt.laborHours)) return anyIt.laborHours;
  return null;
}

function inputCls() {
  return [
    "h-[34px] w-full rounded-lg border border-white/10 bg-black/55",
    "px-3 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-500",
    "focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/70",
    "disabled:opacity-50 disabled:cursor-not-allowed",
  ].join(" ");
}

function textareaCls() {
  return [
    "min-h-[74px] w-full rounded-xl border border-white/10 bg-black/45",
    "px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500",
    "focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/70",
  ].join(" ");
}

function unitCls() {
  return "pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-neutral-400";
}

function cornerShellCls() {
  return "rounded-xl border border-white/10 bg-black/35 shadow-[0_12px_35px_rgba(0,0,0,0.55)] backdrop-blur-xl";
}

function axleTitleCls() {
  return "text-sm font-semibold uppercase tracking-[0.18em] text-[color:var(--accent-copper,#f97316)]";
}

function tinyLabelCls() {
  return "mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-400";
}

export default function TireGridHydraulic(props: Props) {
  const {
    sectionIndex,
    items,
    unitHint,
    requireNoteForAI,
    onSubmitAI,
    isSubmittingAI,
    onUpdateParts,
    onUpdateLaborHours,
  } = props;

  const { updateItem } = useInspectionForm();
  const [open, setOpen] = useState(true);

  const commitValue = (idx: number, value: string) => {
    updateItem(sectionIndex, idx, { value });
  };

  const commitNotes = (idx: number, notes: string) => {
    updateItem(sectionIndex, idx, { notes });
  };

  const commitParts = (idx: number, parts: PartLine[]) => {
    if (typeof onUpdateParts === "function") {
      onUpdateParts(sectionIndex, idx, parts);
      return;
    }
    updateItem(sectionIndex, idx, { parts });
  };

  const commitLabor = (idx: number, hours: number | null) => {
    if (typeof onUpdateLaborHours === "function") {
      onUpdateLaborHours(sectionIndex, idx, hours);
      return;
    }
    updateItem(sectionIndex, idx, { laborHours: hours });
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
          if (kind === "pressure" && !grp.pressure) grp.pressure = cell;
          if (kind === "tread" && !grp.tread) grp.tread = cell;
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
        if (kind === "pressure" && !grp.pressure) grp.pressure = cell;
        if (kind === "tread" && !grp.tread) grp.tread = cell;
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
  const notesOf = (c?: Cell) => (c ? getNotes(items[c.idx]!) : "");

  const FailRecBlock = (itemIndex: number) => {
    const it = items[itemIndex];
    if (!it) return null;

    const status = getStatus(it);
    const isFail = status === "fail";
    const isRec = status === "recommend";
    const isFailOrRec = isFail || isRec;

    if (!isFailOrRec && !requireNoteForAI) return null;

    const note = getNotes(it).trim();
    const canShowSubmit =
      !!requireNoteForAI && isFailOrRec && note.length > 0 && typeof onSubmitAI === "function";

    const submitting = typeof isSubmittingAI === "function" ? isSubmittingAI(sectionIndex, itemIndex) : false;

    if (!isFailOrRec && !canShowSubmit) return null;

    const currentParts = readParts(it);
    const currentLabor = readLaborHours(it);

    const addEmptyPart = () => {
      commitParts(itemIndex, [...currentParts, { description: "", qty: 1 }]);
    };

    const updatePart = (idx: number, patch: Partial<PartLine>) => {
      const next = currentParts.map((p, i) => (i === idx ? { ...p, ...patch } : p));
      commitParts(itemIndex, next);
    };

    const removePart = (idx: number) => {
      const next = currentParts.filter((_, i) => i !== idx);
      commitParts(itemIndex, next);
    };

    return (
      <>
        {isFailOrRec ? (
          <div className="mt-2 rounded-lg border border-white/10 bg-black/25 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[12px] font-semibold text-neutral-100">Parts &amp; Labor</span>
              <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">
                FAIL / REC only
              </span>
            </div>

            <div className="space-y-2">
              {currentParts.map((p, pIdx) => (
                <div
                  key={pIdx}
                  className="flex flex-wrap items-center gap-2 rounded-md border border-white/10 bg-black/30 px-2 py-2"
                >
                  <input
                    className="min-w-0 flex-1 rounded-md border border-neutral-800 bg-neutral-950/70 px-2 py-1 text-[11px] text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/60"
                    placeholder="Part description"
                    value={p.description}
                    onChange={(e) => updatePart(pIdx, { description: e.target.value })}
                  />
                  <input
                    className="w-16 rounded-md border border-neutral-800 bg-neutral-950/70 px-2 py-1 text-[11px] text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/60"
                    placeholder="Qty"
                    type="number"
                    min={1}
                    value={Number.isFinite(p.qty) ? p.qty : ""}
                    onChange={(e) => updatePart(pIdx, { qty: Number(e.target.value) || 1 })}
                  />
                  <button
                    type="button"
                    className="text-[11px] text-red-300 hover:text-red-200"
                    onClick={() => removePart(pIdx)}
                  >
                    Remove
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={addEmptyPart}
                className="mt-1 inline-flex items-center rounded-full border border-white/20 bg-black/30 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-100 hover:border-orange-500/80 hover:text-orange-200"
              >
                + Add Part
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-neutral-400">Labor hours</span>
              <input
                className="w-20 rounded-md border border-neutral-800 bg-neutral-950/70 px-2 py-1 text-[11px] text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/60"
                placeholder="0.0"
                type="number"
                min={0}
                step={0.1}
                value={currentLabor ?? ""}
                onChange={(e) =>
                  commitLabor(itemIndex, e.target.value === "" ? null : Number(e.target.value) || 0)
                }
              />
              <span className="text-[10px] text-neutral-500">(rate + pricing handled later)</span>
            </div>
          </div>
        ) : null}

        {canShowSubmit ? (
          <div className="mt-2 flex items-center justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="px-3"
              disabled={submitting}
              onClick={() => onSubmitAI!(sectionIndex, itemIndex)}
            >
              {submitting ? "Submitting…" : "Submit for estimate"}
            </Button>
          </div>
        ) : null}
      </>
    );
  };

  const TDColumn = (
    cells: { outer?: Cell; inner?: Cell; single?: Cell },
    label: string,
    showInnerAlways: boolean,
  ) => {
    const hasDual = !!(cells.outer || cells.inner);
    const shouldShowInner = showInnerAlways || !!cells.inner;

    const U = (c?: Cell) => (c?.unit ?? "").trim() || "mm";

    return (
      <div className="flex flex-col gap-2">
        <div className={tinyLabelCls()}>{label}</div>

        {!hasDual ? (
          <div className="relative">
            <input
              value={cells.single ? valOf(cells.single) : ""}
              className={inputCls()}
              placeholder={cells.single ? "TD" : "—"}
              inputMode="decimal"
              type="number"
              onChange={(e) => {
                if (!cells.single) return;
                commitValue(cells.single.idx, e.currentTarget.value);
              }}
              disabled={!cells.single}
            />
            <span className={unitCls()}>{U(cells.single)}</span>
          </div>
        ) : (
          <>
            <div className="relative">
              <input
                value={cells.outer ? valOf(cells.outer) : ""}
                className={inputCls()}
                placeholder={cells.outer ? "TD Outer" : "—"}
                inputMode="decimal"
                type="number"
                onChange={(e) => {
                  if (!cells.outer) return;
                  commitValue(cells.outer.idx, e.currentTarget.value);
                }}
                disabled={!cells.outer}
              />
              <span className={unitCls()}>{U(cells.outer)}</span>
            </div>

            {shouldShowInner ? (
              <div className="relative">
                <input
                  value={cells.inner ? valOf(cells.inner) : ""}
                  className={inputCls()}
                  placeholder="TD Inner"
                  inputMode="decimal"
                  type="number"
                  onChange={(e) => {
                    if (!cells.inner) return;
                    commitValue(cells.inner.idx, e.currentTarget.value);
                  }}
                  disabled={!cells.inner}
                />
                <span className={unitCls()}>{U(cells.inner)}</span>
              </div>
            ) : null}
          </>
        )}
      </div>
    );
  };

  const TPCenter = (args: {
    isDual: boolean;
    left: { pressure?: Cell; pressureOuter?: Cell; pressureInner?: Cell };
    right: { pressure?: Cell; pressureOuter?: Cell; pressureInner?: Cell };
  }) => {
    const { isDual, left, right } = args;

    const leftOuter = left.pressureOuter ?? left.pressure;
    const leftInner = left.pressureInner;
    const rightOuter = right.pressureOuter ?? right.pressure;
    const rightInner = right.pressureInner;

    const U = (c?: Cell) => (c?.unit ?? "").trim() || "psi";

    if (!isDual) {
      return (
        <div className="flex flex-col gap-2">
          <div className={tinyLabelCls()}>Tire Pressure</div>

          <div className="overflow-hidden rounded-xl border border-white/10 bg-black/35">
            <div className="grid grid-cols-2 gap-px bg-white/10">
              <div className="bg-black/40 p-2">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-400">
                  Left
                </div>
                <div className="relative">
                  <input
                    value={leftOuter ? valOf(leftOuter) : ""}
                    className={inputCls()}
                    placeholder={leftOuter ? "TP" : "—"}
                    inputMode="decimal"
                    type="number"
                    onChange={(e) => {
                      if (!leftOuter) return;
                      commitValue(leftOuter.idx, e.currentTarget.value);
                    }}
                    disabled={!leftOuter}
                  />
                  <span className={unitCls()}>{U(leftOuter)}</span>
                </div>
              </div>

              <div className="bg-black/40 p-2">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-400">
                  Right
                </div>
                <div className="relative">
                  <input
                    value={rightOuter ? valOf(rightOuter) : ""}
                    className={inputCls()}
                    placeholder={rightOuter ? "TP" : "—"}
                    inputMode="decimal"
                    type="number"
                    onChange={(e) => {
                      if (!rightOuter) return;
                      commitValue(rightOuter.idx, e.currentTarget.value);
                    }}
                    disabled={!rightOuter}
                  />
                  <span className={unitCls()}>{U(rightOuter)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-2">
        <div className={tinyLabelCls()}>Tire Pressure</div>

        <div className="overflow-hidden rounded-xl border border-white/10 bg-black/35">
          <div className="grid grid-cols-2 gap-px bg-white/10">
            <div className="bg-black/40 p-2">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-400">
                  Left
                </span>
                <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">
                  Outer
                </span>
              </div>
              <div className="relative">
                <input
                  value={leftOuter ? valOf(leftOuter) : ""}
                  className={inputCls()}
                  placeholder={leftOuter ? "TP" : "—"}
                  inputMode="decimal"
                  type="number"
                  onChange={(e) => {
                    if (!leftOuter) return;
                    commitValue(leftOuter.idx, e.currentTarget.value);
                  }}
                  disabled={!leftOuter}
                />
                <span className={unitCls()}>{U(leftOuter)}</span>
              </div>
            </div>

            <div className="bg-black/40 p-2">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-400">
                  Right
                </span>
                <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">
                  Outer
                </span>
              </div>
              <div className="relative">
                <input
                  value={rightOuter ? valOf(rightOuter) : ""}
                  className={inputCls()}
                  placeholder={rightOuter ? "TP" : "—"}
                  inputMode="decimal"
                  type="number"
                  onChange={(e) => {
                    if (!rightOuter) return;
                    commitValue(rightOuter.idx, e.currentTarget.value);
                  }}
                  disabled={!rightOuter}
                />
                <span className={unitCls()}>{U(rightOuter)}</span>
              </div>
            </div>

            <div className="bg-black/40 p-2">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-400">
                  Left
                </span>
                <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">
                  Inner
                </span>
              </div>
              <div className="relative">
                <input
                  value={leftInner ? valOf(leftInner) : ""}
                  className={inputCls()}
                  placeholder={leftInner ? "TP" : "TP"}
                  inputMode="decimal"
                  type="number"
                  onChange={(e) => {
                    if (!leftInner) return;
                    commitValue(leftInner.idx, e.currentTarget.value);
                  }}
                  disabled={!leftInner}
                />
                <span className={unitCls()}>{U(leftInner)}</span>
              </div>
            </div>

            <div className="bg-black/40 p-2">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-400">
                  Right
                </span>
                <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">
                  Inner
                </span>
              </div>
              <div className="relative">
                <input
                  value={rightInner ? valOf(rightInner) : ""}
                  className={inputCls()}
                  placeholder={rightInner ? "TP" : "TP"}
                  inputMode="decimal"
                  type="number"
                  onChange={(e) => {
                    if (!rightInner) return;
                    commitValue(rightInner.idx, e.currentTarget.value);
                  }}
                  disabled={!rightInner}
                />
                <span className={unitCls()}>{U(rightInner)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const ConditionPanel = (args: { label: string; cell?: Cell }) => {
    const { label, cell } = args;
    if (!cell) return null;

    const it = items[cell.idx];
    if (!it) return null;

    return (
      <div className="rounded-xl border border-white/10 bg-black/25 p-3">
        <div className={tinyLabelCls()}>{label}</div>

        <StatusButtons
          item={it}
          sectionIndex={sectionIndex}
          itemIndex={cell.idx}
          updateItem={updateItem}
          onStatusChange={(_s: InspectionItemStatus) => {}}
          compact
          wrap
        />

        <div className="mt-2">
          <div className={tinyLabelCls()}>Notes</div>
          <textarea
            className={textareaCls()}
            placeholder="Notes…"
            value={notesOf(cell)}
            onChange={(e) => commitNotes(cell.idx, e.currentTarget.value)}
          />
        </div>

        {FailRecBlock(cell.idx)}
      </div>
    );
  };

  const StatusOrConditions = (t: AxleRow) => {
    const leftCond = t.isDual ? t.dual.left.condition : t.single.left.condition;
    const rightCond = t.isDual ? t.dual.right.condition : t.single.right.condition;

    const hasPerSide = !!(leftCond || rightCond);

    if (hasPerSide) {
      return (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {ConditionPanel({ label: "Left Tire Condition", cell: leftCond })}
          {ConditionPanel({ label: "Right Tire Condition", cell: rightCond })}
        </div>
      );
    }

    if (!t.statusCell) return null;

    const it = items[t.statusCell.idx];
    if (!it) return null;

    return (
      <div className="mt-4 rounded-xl border border-white/10 bg-black/25 p-3">
        <div className={tinyLabelCls()}>Tire Status</div>

        <StatusButtons
          item={it}
          sectionIndex={sectionIndex}
          itemIndex={t.statusCell.idx}
          updateItem={updateItem}
          onStatusChange={(_s: InspectionItemStatus) => {}}
          compact
          wrap
        />

        <div className="mt-2">
          <div className={tinyLabelCls()}>Notes</div>
          <textarea
            className={textareaCls()}
            placeholder="Notes…"
            value={notesOf(t.statusCell)}
            onChange={(e) => commitNotes(t.statusCell!.idx, e.currentTarget.value)}
          />
        </div>

        {FailRecBlock(t.statusCell.idx)}
      </div>
    );
  };

  return (
    <div className="grid w-full gap-3">
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-400">
          Tire Grid – Hydraulic
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
                  <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">
                    TP center • TD corners{isDual ? " • Dual" : " • Single"}
                  </div>
                </div>

                <div className="grid grid-cols-[minmax(170px,1fr)_minmax(320px,1.35fr)_minmax(170px,1fr)] items-start gap-4">
                  {TDColumn(leftTD, "Left Tread Depth", isDual)}
                  {TPCenter({ isDual, left: leftTP, right: rightTP })}
                  {TDColumn(rightTD, "Right Tread Depth", isDual)}
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