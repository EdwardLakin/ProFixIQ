"use client";

import { useMemo, useState } from "react";
import { useInspectionForm } from "@inspections/lib/inspection/ui/InspectionFormContext";
import type { InspectionItem, InspectionItemStatus } from "@inspections/lib/inspection/types";

const POSITIONS = ["LF", "RF", "LR", "RR"] as const;
type Position = (typeof POSITIONS)[number];

type Cell = {
  idx: number;
  item: InspectionItem;
};

type PosCells = {
  // TP (single or dual)
  pressure?: Cell;
  pressureOuter?: Cell;
  pressureInner?: Cell;

  // TD
  treadOuter?: Cell;
  treadInner?: Cell;

  // Status toggle (ok/fail/na/recommend)
  condition?: Cell;
};

const LABEL_RE = /^(?<pos>LF|RF|LR|RR)\s+(?<metric>.+)$/i;

type MetricKind =
  | "pressure"
  | "pressureOuter"
  | "pressureInner"
  | "treadOuter"
  | "treadInner"
  | "condition"
  | "other";

function metricKindFrom(metricRaw: string): MetricKind {
  const m = metricRaw.trim().toLowerCase();

  // condition
  if (m.includes("tire condition") || (m.includes("condition") && !m.includes("rotor"))) {
    return "condition";
  }

  // pressure
  if (m.includes("pressure") || m.includes("tire pressure")) {
    if (m.includes("outer")) return "pressureOuter";
    if (m.includes("inner")) return "pressureInner";
    return "pressure";
  }

  // tread
  if (m.includes("tread")) {
    if (m.includes("outer")) return "treadOuter";
    if (m.includes("inner")) return "treadInner";
    return "treadOuter";
  }

  return "other";
}

function unitFor(kind: MetricKind): string {
  if (kind === "pressure" || kind === "pressureOuter" || kind === "pressureInner") return "psi";
  return "mm";
}

function getLabel(it: InspectionItem): string {
  const anyIt = it as unknown as { item?: unknown; name?: unknown };
  return String(anyIt.item ?? anyIt.name ?? "").trim();
}

function inputBaseClass() {
  return [
    "h-[34px] w-full rounded-lg border border-white/10 bg-black/55",
    "px-3 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-500",
    "focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/70",
    "disabled:opacity-50 disabled:cursor-not-allowed",
  ].join(" ");
}

function smallUnitClass() {
  return "pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-neutral-400";
}

function sectionTitleClass() {
  return "text-sm font-semibold uppercase tracking-[0.18em] text-[color:var(--accent-copper,#f97316)]";
}

function tinyLabelClass() {
  return "mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-400";
}

function pillBase(active: boolean) {
  return [
    "h-7 rounded-full border px-3 text-[10px] font-semibold uppercase tracking-[0.16em]",
    "transition",
    active
      ? "border-orange-500/70 bg-black/75 text-neutral-100 shadow-[0_0_18px_rgba(212,118,49,0.25)]"
      : "border-white/10 bg-black/45 text-neutral-300 hover:border-orange-500/40 hover:bg-black/60",
  ].join(" ");
}

function readStatus(it: InspectionItem): InspectionItemStatus | undefined {
  const anyIt = it as unknown as { status?: unknown };
  const s = anyIt.status;
  if (s === "ok" || s === "fail" || s === "na" || s === "recommend") return s;
  return undefined;
}

export default function TireGridHydraulic(props: { sectionIndex: number; items: InspectionItem[] }) {
  const { sectionIndex, items } = props;
  const { updateItem } = useInspectionForm();
  const [open, setOpen] = useState(true);

  const parsed = useMemo(() => {
    const byPos: Record<Position, PosCells> = { LF: {}, RF: {}, LR: {}, RR: {} };

    items.forEach((it, idx) => {
      const raw = getLabel(it);
      if (!raw) return;

      const m = raw.match(LABEL_RE);
      if (!m?.groups) return;

      const pos = String(m.groups.pos ?? "").toUpperCase() as Position;
      const metric = String(m.groups.metric ?? "").trim();
      if (!POSITIONS.includes(pos) || !metric) return;

      const kind = metricKindFrom(metric);
      if (kind === "other") return;

      const cell: Cell = { idx, item: it };
      const bucket = byPos[pos];

      // Prefer first match (stable) to avoid duplicates overwriting
      if (kind === "pressure" && !bucket.pressure) bucket.pressure = cell;
      if (kind === "pressureOuter" && !bucket.pressureOuter) bucket.pressureOuter = cell;
      if (kind === "pressureInner" && !bucket.pressureInner) bucket.pressureInner = cell;

      if (kind === "treadOuter" && !bucket.treadOuter) bucket.treadOuter = cell;
      if (kind === "treadInner" && !bucket.treadInner) bucket.treadInner = cell;

      if (kind === "condition" && !bucket.condition) bucket.condition = cell;
    });

    const hasAny = POSITIONS.some((p) => {
      const b = byPos[p];
      return !!(
        b.pressure ||
        b.pressureOuter ||
        b.pressureInner ||
        b.treadOuter ||
        b.treadInner ||
        b.condition
      );
    });

    return { byPos, hasAny };
  }, [items]);

  if (!parsed.hasAny) {
    return (
      <div className="rounded-xl border border-white/10 bg-black/40 p-3 text-sm text-neutral-300">
        No hydraulic tire-grid items detected. Expected labels like{" "}
        <code className="text-neutral-100">LF Tire Pressure</code>,{" "}
        <code className="text-neutral-100">LR Tread Depth (Outer)</code>,{" "}
        <code className="text-neutral-100">LR Tire Pressure (Inner)</code>,{" "}
        <code className="text-neutral-100">LF Tire Condition</code>.
      </div>
    );
  }

  const commitValue = (cell: Cell | undefined, value: string) => {
    if (!cell) return;
    updateItem(sectionIndex, cell.idx, { value });
  };

  const commitStatus = (cell: Cell | undefined, status: InspectionItemStatus) => {
    if (!cell) return;
    // NOTE: if your item uses a different field name than `status`, change this line:
    updateItem(sectionIndex, cell.idx, { status });
  };

  const ConditionPills = (pos: Position) => {
    const c = parsed.byPos[pos].condition;
    if (!c) return null;

    const s = readStatus(c.item);

    return (
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className={pillBase(s === "ok")} onClick={() => commitStatus(c, "ok")}>
          OK
        </button>
        <button type="button" className={pillBase(s === "fail")} onClick={() => commitStatus(c, "fail")}>
          Fail
        </button>
        <button type="button" className={pillBase(s === "na")} onClick={() => commitStatus(c, "na")}>
          NA
        </button>
        <button
          type="button"
          className={pillBase(s === "recommend")}
          onClick={() => commitStatus(c, "recommend")}
        >
          Rec
        </button>
      </div>
    );
  };

  const TDStack = (pos: Position, label: string) => {
    const b = parsed.byPos[pos];
    const hasOuter = !!b.treadOuter;
    const hasInner = !!b.treadInner;

    return (
      <div className="flex flex-col gap-2">
        <div className={tinyLabelClass()}>{label}</div>

        <div className="relative">
          <input
            className={inputBaseClass()}
            type="number"
            inputMode="decimal"
            placeholder={hasOuter ? "TD Outer" : "—"}
            value={String(b.treadOuter?.item?.value ?? "")}
            onChange={(e) => commitValue(b.treadOuter, e.currentTarget.value)}
            disabled={!b.treadOuter}
          />
          <span className={smallUnitClass()}>{unitFor("treadOuter")}</span>
        </div>

        {hasInner ? (
          <div className="relative">
            <input
              className={inputBaseClass()}
              type="number"
              inputMode="decimal"
              placeholder="TD Inner"
              value={String(b.treadInner?.item?.value ?? "")}
              onChange={(e) => commitValue(b.treadInner, e.currentTarget.value)}
              disabled={!b.treadInner}
            />
            <span className={smallUnitClass()}>{unitFor("treadInner")}</span>
          </div>
        ) : null}

        {ConditionPills(pos)}
      </div>
    );
  };

  /**
   * Split TP box (2 inputs side-by-side) for FRONT: LF + RF
   */
  const FrontTPSplit = () => {
    const lf = parsed.byPos.LF;
    const rf = parsed.byPos.RF;

    const lfCell = lf.pressureOuter ?? lf.pressure ?? lf.pressureInner;
    const rfCell = rf.pressureOuter ?? rf.pressure ?? rf.pressureInner;

    return (
      <div className="flex flex-col gap-2">
        <div className={tinyLabelClass()}>Tire Pressure</div>

        <div className="overflow-hidden rounded-xl border border-white/10 bg-black/35">
          <div className="grid grid-cols-2 gap-px bg-white/10">
            <div className="bg-black/40 p-2">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-400">
                LF
              </div>
              <div className="relative">
                <input
                  className={inputBaseClass()}
                  type="number"
                  inputMode="decimal"
                  placeholder={lfCell ? "TP" : "—"}
                  value={String(lfCell?.item?.value ?? "")}
                  onChange={(e) => commitValue(lfCell, e.currentTarget.value)}
                  disabled={!lfCell}
                />
                <span className={smallUnitClass()}>{unitFor("pressure")}</span>
              </div>
              {ConditionPills("LF")}
            </div>

            <div className="bg-black/40 p-2">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-400">
                RF
              </div>
              <div className="relative">
                <input
                  className={inputBaseClass()}
                  type="number"
                  inputMode="decimal"
                  placeholder={rfCell ? "TP" : "—"}
                  value={String(rfCell?.item?.value ?? "")}
                  onChange={(e) => commitValue(rfCell, e.currentTarget.value)}
                  disabled={!rfCell}
                />
                <span className={smallUnitClass()}>{unitFor("pressure")}</span>
              </div>
              {ConditionPills("RF")}
            </div>
          </div>
        </div>
      </div>
    );
  };

  /**
   * Quad TP box (2x2) for REAR: LR/RR Outer+Inner
   * With your new default labels, all 4 will be active.
   */
  const RearTPQuad = () => {
    const lr = parsed.byPos.LR;
    const rr = parsed.byPos.RR;

    const lrOuter = lr.pressureOuter ?? lr.pressure;
    const lrInner = lr.pressureInner;
    const rrOuter = rr.pressureOuter ?? rr.pressure;
    const rrInner = rr.pressureInner;

    const CellBox = (cell: Cell | undefined, corner: "LR" | "RR", posLabel: "Outer" | "Inner") => (
      <div className="bg-black/40 p-2">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-400">
            {corner}
          </span>
          <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">{posLabel}</span>
        </div>
        <div className="relative">
          <input
            className={inputBaseClass()}
            type="number"
            inputMode="decimal"
            placeholder={cell ? "TP" : "—"}
            value={String(cell?.item?.value ?? "")}
            onChange={(e) => commitValue(cell, e.currentTarget.value)}
            disabled={!cell}
          />
          <span className={smallUnitClass()}>{unitFor("pressure")}</span>
        </div>
      </div>
    );

    return (
      <div className="flex flex-col gap-2">
        <div className={tinyLabelClass()}>Tire Pressure</div>

        <div className="overflow-hidden rounded-xl border border-white/10 bg-black/35">
          <div className="grid grid-cols-2 gap-px bg-white/10">
            {CellBox(lrOuter, "LR", "Outer")}
            {CellBox(rrOuter, "RR", "Outer")}
            {CellBox(lrInner, "LR", "Inner")}
            {CellBox(rrInner, "RR", "Inner")}
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/30 px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-400">
            Rear tire status
          </div>
          <div className="flex gap-2">
            {/* Rear status uses the same per-corner “Tire Condition” cells */}
            {/* So you can fail LR/RR independently, like real life. */}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>{ConditionPills("LR")}</div>
          <div>{ConditionPills("RR")}</div>
        </div>
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
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/35 shadow-[0_18px_45px_rgba(0,0,0,0.75)] backdrop-blur-xl">
          <div className="p-4">
            <div className="grid gap-7">
              {/* FRONT */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <div className={sectionTitleClass()} style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}>
                    Front
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">
                    TD outside • TP center
                  </div>
                </div>

                <div className="grid grid-cols-[minmax(170px,1fr)_minmax(260px,1.2fr)_minmax(170px,1fr)] items-start gap-4">
                  {TDStack("LF", "LF Tread Depth")}
                  <FrontTPSplit />
                  {TDStack("RF", "RF Tread Depth")}
                </div>

                {/* Taller center body (visual only) */}
                <div className="mt-4 grid grid-cols-[minmax(170px,1fr)_minmax(260px,1.2fr)_minmax(170px,1fr)] gap-4">
                  <div />
                  <div className="h-[150px] w-full rounded-2xl border border-white/10 bg-black/25" />
                  <div />
                </div>
              </div>

              {/* REAR */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <div className={sectionTitleClass()} style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}>
                    Rear
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">
                    TD outside • TP center (dual)
                  </div>
                </div>

                <div className="grid grid-cols-[minmax(170px,1fr)_minmax(320px,1.4fr)_minmax(170px,1fr)] items-start gap-4">
                  {TDStack("LR", "LR Tread Depth")}
                  <RearTPQuad />
                  {TDStack("RR", "RR Tread Depth")}
                </div>

                <div className="mt-4 grid grid-cols-[minmax(170px,1fr)_minmax(320px,1.4fr)_minmax(170px,1fr)] gap-4">
                  <div />
                  <div className="h-[190px] w-full rounded-2xl border border-white/10 bg-black/25" />
                  <div />
                </div>
              </div>

              <div className="pt-1 text-[10px] uppercase tracking-[0.16em] text-neutral-500">
                TP = {unitFor("pressure")} • TD = {unitFor("treadOuter")}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}