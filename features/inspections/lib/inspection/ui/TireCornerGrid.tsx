"use client";

import { useMemo, useState } from "react";
import { useInspectionForm } from "@inspections/lib/inspection/ui/InspectionFormContext";
import StatusButtons from "@inspections/lib/inspection/StatusButtons";
import type { InspectionItem, InspectionItemStatus } from "@inspections/lib/inspection/types";

type Props = {
  sectionIndex: number;
  items: InspectionItem[];
  unitHint?: (label: string) => string;
  onAddAxle?: (axleLabel: string) => void;
  onSpecHint?: (metricLabel: string) => void;
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

  /**
   * Optional row-level fallback status carrier (if your builder provides one).
   * Prefer per-side "Tire Condition" items if present.
   */
  statusCell?: Cell;
};

/**
 * Supported formats:
 *  - Heavy-duty: "Steer 1 Left Tire Pressure", "Drive 1 Right Tread Depth (Outer)", "Drive 1 Left Tire Condition"
 *  - Hydraulic corners: "LF Tire Pressure", "RR Tread Depth", "LR Tread Depth (Inner)", "RF Tire Condition"
 */
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
  const l = label.toLowerCase();

  // Per-side condition item (drives OK/FAIL/REC/NA + notes)
  if (l.includes("tire condition") || l.includes("tyre condition") || l.includes("condition")) return "condition";

  // Optional “row-level” carrier if you ever add one (ex: "Rear 1 Tire Status")
  if (l.includes("tire status") || l.includes("tyre status")) return "status";

  if (l.includes("tire pressure") || l.includes("pressure")) {
    if (l.includes("outer")) return "pressureOuter";
    if (l.includes("inner")) return "pressureInner";
    return "pressure";
  }

  if (l.includes("tread depth") || l.includes("tread") || l.includes("tire tread")) {
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
  // Steer is single. Everything else (drive/rear/tag/trailer) is dual.
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

  // fallback
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

  // fallback
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

function notesCls() {
  return [
    "mt-2 w-full rounded-lg border border-white/10 bg-black/55",
    "px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500",
    "focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/70",
  ].join(" ");
}

export default function TireGrid({ sectionIndex, items, unitHint, onAddAxle }: Props) {
  const { updateItem } = useInspectionForm();
  const [open, setOpen] = useState(true);

  const commitValue = (idx: number, value: string) => {
    updateItem(sectionIndex, idx, { value });
  };

  const commitNotes = (idx: number, notes: string) => {
    updateItem(sectionIndex, idx, { notes });
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
        (it as unknown as { unit?: unknown }).unit === null || typeof (it as unknown as { unit?: unknown }).unit === "string"
          ? ((it as unknown as { unit?: string | null }).unit ?? null)
          : null;

      // Row-level tire status carrier (optional)
      const kindLoose = metricKindFrom(label);
      if (kindLoose === "status" && !AXLE_LABEL_RE.test(label) && !HYD_CORNER_RE.test(label)) {
        const l = label.toLowerCase();
        const axleLabel =
          l.includes("rear") ? "Rear 1" : l.includes("front") || l.includes("steer") ? "Steer 1" : "Rear 1";
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

      // 1) Hydraulic corner style: "LF Tire Pressure", "RR Tread Depth (Inner)", "RF Tire Condition"
      const hyd = label.match(HYD_CORNER_RE);
      if (hyd?.groups?.corner && hyd.groups.metric) {
        const corner = String(hyd.groups.corner).toUpperCase() as HydCorner;
        const metric = String(hyd.groups.metric).trim();
        const { axleLabel, side } = cornerToAxleSide(corner);

        const kind = metricKindFrom(metric);
        if (kind === "other") return;

        const row = ensure(axleLabel);
        row.isDual = isDualAxleLabel(axleLabel);

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
        if (kind === "pressure" || kind === "pressureOuter" || kind === "pressureInner") {
          placeDualPressure(grp, kind, metric, cell);
        }
        if (kind === "tread" || kind === "treadOuter" || kind === "treadInner") {
          placeDualTread(grp, kind, metric, cell);
        }
        return;
      }

      // 2) Heavy-duty axle style: "Drive 1 Left Tread Depth (Outer)", "Drive 1 Right Tire Condition"
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

  const existingAxles = tables.map((t) => t.axle);

  const ItemActions = (cell: Cell | undefined) => {
    if (!cell) return null;

    const it = items[cell.idx];
    if (!it) return null;

    return (
      <div className="mt-2">
        <StatusButtons
          item={it}
          sectionIndex={sectionIndex}
          itemIndex={cell.idx}
          updateItem={updateItem}
          onStatusChange={(_s: InspectionItemStatus) => {}}
          compact
          wrap
        />

        <textarea
          className={notesCls()}
          placeholder="Notes…"
          defaultValue={readNotes(it)}
          onBlur={(e) => {
            commitNotes(cell.idx, e.currentTarget.value);
          }}
          rows={2}
        />
      </div>
    );
  };

  const TDColumn = (cells: { outer?: Cell; inner?: Cell; single?: Cell }, label: string, showInnerAlways: boolean) => {
    const hasDual = !!(cells.outer || cells.inner);
    const shouldShowInner = showInnerAlways || !!cells.inner;
    const U = (cell: Cell | undefined) => (cell?.unit ?? "").trim() || "mm";

    return (
      <div className="flex flex-col gap-2">
        <div className={tinyLabelCls()}>{label}</div>

        {!hasDual ? (
          <div>
            <div className="relative">
              <input
                defaultValue={cells.single?.initial ?? ""}
                className={inputCls()}
                placeholder={cells.single ? "TD" : "—"}
                inputMode="decimal"
                type="number"
                onBlur={(e) => {
                  if (!cells.single) return;
                  commitValue(cells.single.idx, e.currentTarget.value);
                }}
                disabled={!cells.single}
              />
              <span className={unitCls()}>{U(cells.single)}</span>
            </div>

            {ItemActions(cells.single)}
          </div>
        ) : (
          <>
            <div>
              <div className="relative">
                <input
                  defaultValue={cells.outer?.initial ?? ""}
                  className={inputCls()}
                  placeholder={cells.outer ? "TD Outer" : "—"}
                  inputMode="decimal"
                  type="number"
                  onBlur={(e) => {
                    if (!cells.outer) return;
                    commitValue(cells.outer.idx, e.currentTarget.value);
                  }}
                  disabled={!cells.outer}
                />
                <span className={unitCls()}>{U(cells.outer)}</span>
              </div>

              {ItemActions(cells.outer)}
            </div>

            {shouldShowInner ? (
              <div>
                <div className="relative">
                  <input
                    defaultValue={cells.inner?.initial ?? ""}
                    className={inputCls()}
                    placeholder="TD Inner"
                    inputMode="decimal"
                    type="number"
                    onBlur={(e) => {
                      if (!cells.inner) return;
                      commitValue(cells.inner.idx, e.currentTarget.value);
                    }}
                    disabled={!cells.inner}
                  />
                  <span className={unitCls()}>{U(cells.inner)}</span>
                </div>

                {ItemActions(cells.inner)}
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

    const U = (cell: Cell | undefined) => (cell?.unit ?? "").trim() || "psi";

    if (!isDual) {
      return (
        <div className="flex flex-col gap-2">
          <div className={tinyLabelCls()}>Tire Pressure</div>

          <div className="overflow-hidden rounded-xl border border-white/10 bg-black/35">
            <div className="grid grid-cols-2 gap-px bg-white/10">
              <div className="bg-black/40 p-2">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-400">Left</div>

                <div className="relative">
                  <input
                    defaultValue={leftOuter?.initial ?? ""}
                    className={inputCls()}
                    placeholder={leftOuter ? "TP" : "—"}
                    inputMode="decimal"
                    type="number"
                    onBlur={(e) => {
                      if (!leftOuter) return;
                      commitValue(leftOuter.idx, e.currentTarget.value);
                    }}
                    disabled={!leftOuter}
                  />
                  <span className={unitCls()}>{U(leftOuter)}</span>
                </div>

                {ItemActions(leftOuter)}
              </div>

              <div className="bg-black/40 p-2">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-400">Right</div>

                <div className="relative">
                  <input
                    defaultValue={rightOuter?.initial ?? ""}
                    className={inputCls()}
                    placeholder={rightOuter ? "TP" : "—"}
                    inputMode="decimal"
                    type="number"
                    onBlur={(e) => {
                      if (!rightOuter) return;
                      commitValue(rightOuter.idx, e.currentTarget.value);
                    }}
                    disabled={!rightOuter}
                  />
                  <span className={unitCls()}>{U(rightOuter)}</span>
                </div>

                {ItemActions(rightOuter)}
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
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-400">Left</span>
                <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">Outer</span>
              </div>

              <div className="relative">
                <input
                  defaultValue={leftOuter?.initial ?? ""}
                  className={inputCls()}
                  placeholder={leftOuter ? "TP" : "—"}
                  inputMode="decimal"
                  type="number"
                  onBlur={(e) => {
                    if (!leftOuter) return;
                    commitValue(leftOuter.idx, e.currentTarget.value);
                  }}
                  disabled={!leftOuter}
                />
                <span className={unitCls()}>{U(leftOuter)}</span>
              </div>

              {ItemActions(leftOuter)}
            </div>

            <div className="bg-black/40 p-2">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-400">Right</span>
                <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">Outer</span>
              </div>

              <div className="relative">
                <input
                  defaultValue={rightOuter?.initial ?? ""}
                  className={inputCls()}
                  placeholder={rightOuter ? "TP" : "—"}
                  inputMode="decimal"
                  type="number"
                  onBlur={(e) => {
                    if (!rightOuter) return;
                    commitValue(rightOuter.idx, e.currentTarget.value);
                  }}
                  disabled={!rightOuter}
                />
                <span className={unitCls()}>{U(rightOuter)}</span>
              </div>

              {ItemActions(rightOuter)}
            </div>

            <div className="bg-black/40 p-2">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-400">Left</span>
                <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">Inner</span>
              </div>

              <div className="relative">
                <input
                  defaultValue={leftInner?.initial ?? ""}
                  className={inputCls()}
                  placeholder={leftInner ? "TP" : "—"}
                  inputMode="decimal"
                  type="number"
                  onBlur={(e) => {
                    if (!leftInner) return;
                    commitValue(leftInner.idx, e.currentTarget.value);
                  }}
                  disabled={!leftInner}
                />
                <span className={unitCls()}>{U(leftInner)}</span>
              </div>

              {ItemActions(leftInner)}
            </div>

            <div className="bg-black/40 p-2">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-400">Right</span>
                <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">Inner</span>
              </div>

              <div className="relative">
                <input
                  defaultValue={rightInner?.initial ?? ""}
                  className={inputCls()}
                  placeholder={rightInner ? "TP" : "—"}
                  inputMode="decimal"
                  type="number"
                  onBlur={(e) => {
                    if (!rightInner) return;
                    commitValue(rightInner.idx, e.currentTarget.value);
                  }}
                  disabled={!rightInner}
                />
                <span className={unitCls()}>{U(rightInner)}</span>
              </div>

              {ItemActions(rightInner)}
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

        <textarea
          className={notesCls()}
          placeholder="Notes…"
          defaultValue={readNotes(it)}
          onBlur={(e) => commitNotes(cell.idx, e.currentTarget.value)}
          rows={2}
        />
      </div>
    );
  };

  const RowCondition = (t: AxleRow) => {
    const leftCond = t.isDual ? t.dual.left.condition : t.single.left.condition;
    const rightCond = t.isDual ? t.dual.right.condition : t.single.right.condition;
    if (!leftCond && !rightCond && !t.statusCell) return null;

    // Prefer per-side conditions
    if (leftCond || rightCond) {
      return (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {ConditionPanel({ label: "Left Tire Condition", cell: leftCond })}
          {ConditionPanel({ label: "Right Tire Condition", cell: rightCond })}
        </div>
      );
    }

    // Fallback: row-level status carrier (if you have it)
    if (!t.statusCell) return null;

    const it = items[t.statusCell.idx];
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
        <textarea
          className={notesCls()}
          placeholder="Notes…"
          defaultValue={readNotes(it)}
          onBlur={(e) => commitNotes(t.statusCell!.idx, e.currentTarget.value)}
          rows={2}
        />
      </div>
    );
  };

  return (
    <div className="grid w-full gap-3">
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-400">Tire Grid – Air Brake</div>

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

      {onAddAxle ? <AddAxlePicker existing={existingAxles} onAddAxle={onAddAxle} /> : null}

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