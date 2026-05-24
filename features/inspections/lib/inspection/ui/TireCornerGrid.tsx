// features/inspections/lib/inspection/ui/TireCornerGrid.tsx
"use client";

import { useMemo, useState } from "react";
import { useInspectionForm } from "@inspections/lib/inspection/ui/InspectionFormContext";
import type {
  InspectionItem,
} from "@inspections/lib/inspection/types";
import { Button } from "@shared/components/ui/Button";

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
  onAddAxle?: (axleLabel: string) => void;
  onSpecHint?: (metricLabel: string) => void;

  /** Fail/Rec recommend logic (mirrors SectionDisplay) */
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
  initial: string;
};

type SingleSide = {
  pressure?: Cell;
  tread?: Cell;
  condition?: Cell;
};

type DualSide = {
  pressure?: Cell;
  pressureOuter?: Cell;
  pressureInner?: Cell;

  tread?: Cell;
  treadOuter?: Cell;
  treadInner?: Cell;

  condition?: Cell;
};

type AxleRow = {
  axle: string;
  isDual: boolean;
  single: { left: SingleSide; right: SingleSide };
  dual: { left: DualSide; right: DualSide };
  statusCell?: Cell;
};

/**
 * Supported format (AIR ONLY):
 *  - "Steer 1 Left Tire Pressure", "Drive 1 Right Tread Depth (Outer)", "Drive 1 Left Tire Condition"
 */
const AXLE_LABEL_RE = /^(?<axle>.+?)\s+(?<side>Left|Right)\s+(?<metric>.+)$/i;

function metricKindFrom(label: string): MetricKind {
  const l = label.toLowerCase().trim();

  if (
    l.includes("tire condition") ||
    l.includes("tyre condition") ||
    /\bcondition\b/i.test(l)
  ) {
    return "condition";
  }

  if (
    l.includes("tire status") ||
    l.includes("tyre status") ||
    /\bstatus\b/i.test(l)
  ) {
    if (l.includes("tire status") || l.includes("tyre status")) return "status";
  }

  const hasPressureWord =
    l.includes("tire pressure") ||
    l.includes("tyre pressure") ||
    l.includes("pressure");

  const hasPressureAbbrev =
    /\b(tp)\b/i.test(l) || /\bpsi\b/i.test(l) || /\bkpa\b/i.test(l);

  if (hasPressureWord || hasPressureAbbrev) {
    if (l.includes("outer")) return "pressureOuter";
    if (l.includes("inner")) return "pressureInner";
    return "pressure";
  }

  const hasTreadWord =
    l.includes("tread depth") ||
    l.includes("tread") ||
    l.includes("tire tread") ||
    l.includes("tyre tread");

  const hasTreadAbbrev = /\b(td)\b/i.test(l);

  if (hasTreadWord || hasTreadAbbrev) {
    if (l.includes("outer")) return "treadOuter";
    if (l.includes("inner")) return "treadInner";
    return "tread";
  }

  if (l.includes("tire status") || l.includes("tyre status")) return "status";

  return "other";
}

function extractPos(metricLabel: string): DualPos | null {
  const l = metricLabel.toLowerCase();
  if (l.includes("outer")) return "Outer";
  if (l.includes("inner")) return "Inner";
  return null;
}

function pickUnit(
  explicit: string | null | undefined,
  hinted: string | null | undefined,
): string {
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

function placeSingleTread(side: SingleSide, cell: Cell): void {
  if (!side.tread) side.tread = cell;
}

function placeDualTread(
  side: DualSide,
  kind: MetricKind,
  metricLabel: string,
  cell: Cell,
): void {
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

function placeDualPressure(
  side: DualSide,
  kind: MetricKind,
  metricLabel: string,
  cell: Cell,
): void {
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

function readNotes(it: InspectionItem): string {
  const anyIt = it as unknown as { notes?: unknown; note?: unknown };
  return String(anyIt.notes ?? anyIt.note ?? "").trim();
}

function readParts(it: InspectionItem): PartLine[] {
  const anyIt = it as unknown as { parts?: unknown };
  if (!Array.isArray(anyIt.parts)) return [];
  return anyIt.parts
    .map((p) => {
      const obj = p as { description?: unknown; qty?: unknown };
      const description = String(obj.description ?? "").trim();
      const qty = Number(obj.qty ?? 0);
      return { description, qty };
    })
    .filter((p) => p.description.length > 0 || p.qty > 0);
}

function readLaborHours(it: InspectionItem): number | null {
  const anyIt = it as unknown as { laborHours?: unknown };
  if (typeof anyIt.laborHours === "number" && !Number.isNaN(anyIt.laborHours)) {
    return anyIt.laborHours;
  }
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

function axleFromRowStatusLabel(label: string): string | null {
  const m = label.match(/^(?<axle>.+?)\s+Tire\s+Status$/i);
  const raw = String(m?.groups?.axle ?? "").trim();
  if (!raw) return null;

  const l = raw.toLowerCase();
  if (l.startsWith("steer")) return raw;
  if (l.startsWith("drive")) return raw;
  if (l.startsWith("rear")) return raw;
  if (l.startsWith("tag")) return raw;
  if (l.startsWith("trailer")) return raw;

  if (l.startsWith("front")) return raw.replace(/^front/i, "Steer");
  return null;
}

export default function TireGrid(props: Props) {
  const {
    sectionIndex,
    items,
    unitHint,
    onAddAxle,
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
      const explicitUnit =
        (it as unknown as { unit?: unknown }).unit === null ||
        typeof (it as unknown as { unit?: unknown }).unit === "string"
          ? ((it as unknown as { unit?: string | null }).unit ?? null)
          : null;

      const kindLoose = metricKindFrom(label);

      if (kindLoose === "status" && !AXLE_LABEL_RE.test(label)) {
        const axleLabel = axleFromRowStatusLabel(label);
        if (!axleLabel) return;

        const row = ensure(axleLabel);
        if (!row.statusCell) {
          row.statusCell = {
            idx,
            label,
            unit: pickUnit(explicitUnit, hintedUnit),
            initial: String((it as unknown as { value?: unknown }).value ?? ""),
          };
        }
        return;
      }

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

      const cell: Cell = {
        idx,
        label,
        unit: pickUnit(explicitUnit, hintedUnit),
        initial: String((it as unknown as { value?: unknown }).value ?? ""),
      };

      if (kind === "status") {
        if (!row.statusCell) row.statusCell = cell;
        return;
      }

      if (!row.isDual) {
        const grp = side === "Left" ? row.single.left : row.single.right;
        if (kind === "condition" && !grp.condition) grp.condition = cell;
        if (kind === "pressure" && !grp.pressure) grp.pressure = cell;
        if (kind === "tread" && !grp.tread) placeSingleTread(grp, cell);
        return;
      }

      const grp = side === "Left" ? row.dual.left : row.dual.right;
      if (kind === "condition" && !grp.condition) grp.condition = cell;

      if (
        kind === "pressure" ||
        kind === "pressureOuter" ||
        kind === "pressureInner"
      ) {
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

  const existingAxles = tables.map((t) => t.axle);

  const ConditionPanel = ({ itemIndex }: { itemIndex: number }) => {

    const it = items[itemIndex];
    if (!it) return null;

    const status = String((it as { status?: unknown }).status ?? "").toLowerCase();
    const isFail = status === "fail";
    const isRec = status === "recommend";
    const isFailOrRec = isFail || isRec;

    if (!isFailOrRec && !requireNoteForAI) return null;

    const note = readNotes(it).trim();
    const canShowSubmit =
      !!requireNoteForAI &&
      isFailOrRec &&
      note.length > 0 &&
      typeof onSubmitAI === "function";

    const submitting =
      typeof isSubmittingAI === "function"
        ? isSubmittingAI(sectionIndex, itemIndex)
        : false;

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
        {/* Parts + Labor, only for FAIL / REC items */}
        {isFailOrRec ? (
          <div className="mt-2 rounded-lg border border-white/10 bg-black/25 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[12px] font-semibold text-neutral-100">
                Parts &amp; Labor
              </span>
              <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">
                FAIL / REC only
              </span>
            </div>

            {/* Parts list */}
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
                    onChange={(e) =>
                      updatePart(pIdx, { description: e.target.value })
                    }
                  />
                  <input
                    className="w-16 rounded-md border border-neutral-800 bg-neutral-950/70 px-2 py-1 text-[11px] text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/60"
                    placeholder="Qty"
                    type="number"
                    min={1}
                    value={Number.isFinite(p.qty) ? p.qty : ""}
                    onChange={(e) =>
                      updatePart(pIdx, { qty: Number(e.target.value) || 1 })
                    }
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

            {/* Labor */}
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
                  commitLabor(
                    itemIndex,
                    e.target.value === "" ? null : Number(e.target.value) || 0,
                  )
                }
              />
              <span className="text-[10px] text-neutral-500">
                (rate + pricing handled later)
              </span>
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

  void ConditionPanel;

  const ItemActions = (cell: Cell | undefined) => {
    if (!cell) return null;
    // TODO(ai): surface tread/pressure inference suggestions in detail findings instead of grid rows.
    return null;
  };

  const renderMeasureRow = (
    leftLabel: string,
    leftCell?: Cell,
    rightLabel?: string,
    rightCell?: Cell,
    unitFallback = "psi",
  ) => {
    const U = (cell: Cell | undefined) => (cell?.unit ?? "").trim() || unitFallback;
    const isInches = (u: string) => u.toLowerCase() === "in" || u.toLowerCase() === "inch" || u === '"';
    const isText = (cell: Cell | undefined) => isInches(U(cell));
    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {[
          { label: leftLabel, cell: leftCell },
          rightLabel ? { label: rightLabel, cell: rightCell } : null,
        ].filter(Boolean).map((entry) => {
          const e = entry as { label: string; cell?: Cell };
          return (
            <div key={e.label} className="grid grid-cols-[100px_minmax(0,1fr)] items-center gap-2">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-400">{e.label}</div>
              <div>
                <div className="relative">
                  <input
                    defaultValue={e.cell?.initial ?? ""}
                    className={inputCls()}
                    placeholder={e.cell ? "Value" : "—"}
                    inputMode={isText(e.cell) ? "text" : "decimal"}
                    type={isText(e.cell) ? "text" : "number"}
                    onBlur={(ev) => e.cell && commitValue(e.cell.idx, ev.currentTarget.value)}
                    disabled={!e.cell}
                  />
                  <span className={unitCls()}>{U(e.cell)}</span>
                </div>
                {ItemActions(e.cell)}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const RowCondition = (_t: AxleRow) => {
    // TODO(ai): evaluate condition hints in lower/detail inspection sections only.
    return null;
  };

    return (
    <div className="grid w-full gap-3">
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-400">
          Tire Grid – Air Brake
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
        <AddAxlePicker existing={existingAxles} onAddAxle={onAddAxle} />
      ) : null}

      {open ? (
        <div className="grid gap-4">
          {tables.map((t) => {
            const isDual = t.isDual;

            const leftTD = isDual
              ? {
                  outer: t.dual.left.treadOuter ?? t.dual.left.tread,
                  inner: t.dual.left.treadInner,
                }
              : { single: t.single.left.tread };

            const rightTD = isDual
              ? {
                  outer: t.dual.right.treadOuter ?? t.dual.right.tread,
                  inner: t.dual.right.treadInner,
                }
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
                  <div
                    className={axleTitleCls()}
                    style={{
                      fontFamily: "Black Ops One, system-ui, sans-serif",
                    }}
                  >
                    {t.axle}
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">
                    TP / TD capture only
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <div className={tinyLabelCls()}>Tread Depth</div>
                    <div className="space-y-2 rounded-xl border border-white/10 bg-black/35 p-2.5">
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
                    <div className="space-y-2 rounded-xl border border-white/10 bg-black/35 p-2.5">
                      {isDual
                        ? (
                          <>
                            {renderMeasureRow("Left Outer", leftTP.pressureOuter ?? leftTP.pressure, "Right Outer", rightTP.pressureOuter ?? rightTP.pressure, "psi")}
                            {(leftTP.pressureInner || rightTP.pressureInner)
                              ? renderMeasureRow("Left Inner", leftTP.pressureInner, "Right Inner", rightTP.pressureInner, "psi")
                              : null}
                          </>
                        )
                        : renderMeasureRow("Left", leftTP.pressure, "Right", rightTP.pressure, "psi")}
                    </div>
                  </div>
                </div>

                {RowCondition(t)}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function AddAxlePicker({
  existing,
  onAddAxle,
}: {
  existing: string[];
  onAddAxle: (axleLabel: string) => void;
}) {
  const [pending, setPending] = useState<string>("");

  const candidates = useMemo(() => {
    const wants: string[] = [];
    for (let i = 1; i <= 2; i++) wants.push(`Steer ${i}`);
    for (let i = 1; i <= 4; i++) wants.push(`Drive ${i}`);
    wants.push("Rear 1");
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
