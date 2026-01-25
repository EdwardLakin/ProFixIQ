"use client";

import { useMemo, useState } from "react";
import { useInspectionForm } from "@inspections/lib/inspection/ui/InspectionFormContext";
import type { InspectionItem, InspectionItemStatus } from "@inspections/lib/inspection/types";
import StatusButtons from "@inspections/lib/inspection/StatusButtons";

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
};

type DualSide = {
  pressure?: Cell; // if only one TP is provided for a dual side
  pressureOuter?: Cell;
  pressureInner?: Cell;
  treadOuter?: Cell;
  treadInner?: Cell;
};

type AxleRow = {
  axle: string;
  isDual: boolean;
  single: { left: SingleSide; right: SingleSide };
  dual: { left: DualSide; right: DualSide };
  statusCell?: Cell; // status + notes live here (FAIL/REC capture uses notes)
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
  const l = label.toLowerCase();

  // status / notes carrier (used for FAIL/REC capture)
  if (l.includes("tire status") || l.includes("tyre status")) return "status";

  if (l.includes("tire pressure") || l.includes("pressure")) {
    if (l.includes("outer")) return "pressureOuter";
    if (l.includes("inner")) return "pressureInner";
    return "pressure";
  }

  if (l.includes("tread depth") || l.includes("tread") || l.includes("tire tread")) {
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

function placeSingleTread(side: SingleSide, cell: Cell): void {
  if (!side.tread) side.tread = cell;
}

function placeDualTread(side: DualSide, pos: DualPos | null, cell: Cell): void {
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

function placeDualPressure(side: DualSide, pos: DualPos | null, cell: Cell): void {
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

    const labelFor = (it: InspectionItem) => String(it.item ?? (it as any).name ?? "").trim();

    items.forEach((it, idx) => {
      const label = labelFor(it);
      if (!label) return;

      const hintedUnit = unitHint ? unitHint(label) : "";
      const unit = pickUnit((it as any).unit ?? null, hintedUnit);

      // If this is a global "Rear Tire Status" / "Tire Status" style item,
      // attach it to Rear 1 (or Steer 1 if it says front/steer).
      const kindLoose = metricKindFrom(label);
      if (kindLoose === "status" && !AXLE_LABEL_RE.test(label) && !HYD_CORNER_RE.test(label)) {
        const l = label.toLowerCase();
        const axleLabel =
          l.includes("rear") ? "Rear 1" : l.includes("front") || l.includes("steer") ? "Steer 1" : "Rear 1";
        const row = ensure(axleLabel);
        if (!row.statusCell) row.statusCell = { idx, label, unit };
        return;
      }

      // 1) Hydraulic corner style: "LF Tire Pressure"
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

        // Allow a status item like: "LR Tire Status" etc
        if (kind === "status") {
          if (!row.statusCell) row.statusCell = cell;
          return;
        }

        if (!row.isDual) {
          const grp = side === "Left" ? row.single.left : row.single.right;
          if (kind === "pressure" && !grp.pressure) grp.pressure = cell;
          if (kind === "tread") placeSingleTread(grp, cell);
          return;
        }

        const grp = side === "Left" ? row.dual.left : row.dual.right;
        if (kind === "pressure" || kind === "pressureOuter" || kind === "pressureInner") {
          placeDualPressure(grp, extractPos(metric), cell);
        }
        if (kind === "tread") placeDualTread(grp, extractPos(metric), cell);
        return;
      }

      // 2) Heavy-duty axle style: "Drive 1 Left Tread Depth (Outer)"
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
        if (kind === "pressure" && !grp.pressure) grp.pressure = cell;
        if (kind === "tread") placeSingleTread(grp, cell);
        return;
      }

      const grp = side === "Left" ? row.dual.left : row.dual.right;
      if (kind === "pressure" || kind === "pressureOuter" || kind === "pressureInner") {
        placeDualPressure(grp, extractPos(metric), cell);
      }
      if (kind === "tread") placeDualTread(grp, extractPos(metric), cell);
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

  const TDColumn = (cells: { outer?: Cell; inner?: Cell; single?: Cell }, label: string, showInnerAlways: boolean) => {
    const hasDual = !!(cells.outer || cells.inner);
    const shouldShowInner = showInnerAlways || !!cells.inner;

    const getVal = (c?: Cell) => {
      if (!c) return "";
      return String((items[c.idx] as any)?.value ?? "");
    };

    return (
      <div className="flex flex-col gap-2">
        <div className={tinyLabelCls()}>{label}</div>

        {!hasDual ? (
          <div className="relative">
            <input
              value={cells.single ? getVal(cells.single) : ""}
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
            <span className={unitCls()}>{(cells.single?.unit ?? "mm").trim() || "mm"}</span>
          </div>
        ) : (
          <>
            <div className="relative">
              <input
                value={cells.outer ? getVal(cells.outer) : ""}
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
              <span className={unitCls()}>{(cells.outer?.unit ?? "mm").trim() || "mm"}</span>
            </div>

            {shouldShowInner ? (
              <div className="relative">
                <input
                  value={cells.inner ? getVal(cells.inner) : ""}
                  className={inputCls()}
                  placeholder={cells.inner ? "TD Inner" : "TD Inner"}
                  inputMode="decimal"
                  type="number"
                  onChange={(e) => {
                    if (!cells.inner) return;
                    commitValue(cells.inner.idx, e.currentTarget.value);
                  }}
                  disabled={!cells.inner}
                />
                <span className={unitCls()}>{(cells.inner?.unit ?? "mm").trim() || "mm"}</span>
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

    const getVal = (c?: Cell) => {
      if (!c) return "";
      return String((items[c.idx] as any)?.value ?? "");
    };

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
                    value={leftOuter ? getVal(leftOuter) : ""}
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
                    value={rightOuter ? getVal(rightOuter) : ""}
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
            {/* Left Outer */}
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
                  value={leftOuter ? getVal(leftOuter) : ""}
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

            {/* Right Outer */}
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
                  value={rightOuter ? getVal(rightOuter) : ""}
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

            {/* Left Inner */}
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
                  value={leftInner ? getVal(leftInner) : ""}
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

            {/* Right Inner */}
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
                  value={rightInner ? getVal(rightInner) : ""}
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

  const StatusAndNotes = (t: AxleRow) => {
    if (!t.statusCell) return null;

    const item = items[t.statusCell.idx] as InspectionItem;

    return (
      <div className="mt-4 grid gap-3">
        <div>
          <div className={tinyLabelCls()}>Tire Status</div>
          <StatusButtons
            item={item}
            sectionIndex={sectionIndex}
            itemIndex={t.statusCell.idx}
            updateItem={updateItem}
            onStatusChange={(_status: InspectionItemStatus) => {
              // GenericInspectionScreen handles capture UI elsewhere based on inspection state.
              // We just set status here (StatusButtons already calls updateItem).
            }}
            compact
            wrap
          />
        </div>

        <div>
          <div className={tinyLabelCls()}>Notes</div>
          <textarea
            className={textareaCls()}
            placeholder="Notes for FAIL / RECOMMEND (used for capture + parts/labor)"
            value={String((item as any).notes ?? (item as any).note ?? "")}
            onChange={(e) => commitNotes(t.statusCell!.idx, e.currentTarget.value)}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="grid w-full gap-3">
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-400">
          Tire Grid – Air Brake (hydraulic-style layout)
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

      {onAddAxle ? <AddAxlePicker existing={existingAxles} onAddAxle={onAddAxle} /> : null}

      {open ? (
        <div className="grid gap-4">
          {tables.map((t) => {
            const isDual = t.isDual;

            const leftTD = isDual
              ? { outer: t.dual.left.treadOuter, inner: t.dual.left.treadInner }
              : { single: t.single.left.tread };

            const rightTD = isDual
              ? { outer: t.dual.right.treadOuter, inner: t.dual.right.treadInner }
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

                {/* 3 columns: TD | TP cluster | TD */}
                <div className="grid grid-cols-[minmax(170px,1fr)_minmax(320px,1.35fr)_minmax(170px,1fr)] items-start gap-4">
                  {/* Left TD */}
                  {TDColumn(leftTD, "Left Tread Depth", isDual)}

                  {/* Center TP split/quad */}
                  {TPCenter({
                    isDual,
                    left: leftTP,
                    right: rightTP,
                  })}

                  {/* Right TD */}
                  {TDColumn(rightTD, "Right Tread Depth", isDual)}
                </div>

                {/* Status + Notes (drives FAIL/REC capture flow) */}
                {StatusAndNotes(t)}
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