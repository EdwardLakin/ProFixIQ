"use client";

import { useMemo, useState } from "react";
import { useInspectionForm } from "@inspections/lib/inspection/ui/InspectionFormContext";
import type { InspectionItem } from "@inspections/lib/inspection/types";

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
};

const LABEL_RE = /^(?<pos>LF|RF|LR|RR)\s+(?<metric>.+)$/i;

type MetricKind =
  | "pressure"
  | "pressureOuter"
  | "pressureInner"
  | "treadOuter"
  | "treadInner"
  | "other";

function metricKindFrom(metricRaw: string): MetricKind {
  const m = metricRaw.trim().toLowerCase();

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
    });

    const hasAny = POSITIONS.some((p) => {
      const b = byPos[p];
      return !!(
        b.pressure ||
        b.pressureOuter ||
        b.pressureInner ||
        b.treadOuter ||
        b.treadInner
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
        <code className="text-neutral-100">LR Tread Depth (Inner)</code>.
      </div>
    );
  }

  const commit = (cell: Cell | undefined, value: string) => {
    if (!cell) return;
    updateItem(sectionIndex, cell.idx, { value });
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
            onChange={(e) => commit(b.treadOuter, e.currentTarget.value)}
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
              onChange={(e) => commit(b.treadInner, e.currentTarget.value)}
              disabled={!b.treadInner}
            />
            <span className={smallUnitClass()}>{unitFor("treadInner")}</span>
          </div>
        ) : null}
      </div>
    );
  };

  /**
   * Split TP box (2 inputs side-by-side) for FRONT
   * LF + RF
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
            {/* LF */}
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
                  onChange={(e) => commit(lfCell, e.currentTarget.value)}
                  disabled={!lfCell}
                />
                <span className={smallUnitClass()}>{unitFor("pressure")}</span>
              </div>
            </div>

            {/* RF */}
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
                  onChange={(e) => commit(rfCell, e.currentTarget.value)}
                  disabled={!rfCell}
                />
                <span className={smallUnitClass()}>{unitFor("pressure")}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  /**
   * Quad TP box (2x2) for REAR
   * Goal: split into 4.
   *
   * If you only have "LR Tire Pressure" / "RR Tire Pressure" (no inner/outer),
   * we still render 2 boxes and disable the other 2.
   *
   * If you add labels later like:
   * - "LR Tire Pressure (Outer)" + "LR Tire Pressure (Inner)"
   * - "RR Tire Pressure (Outer)" + "RR Tire Pressure (Inner)"
   * it will automatically fill all 4.
   */
  const RearTPQuad = () => {
    const lr = parsed.byPos.LR;
    const rr = parsed.byPos.RR;

    const lrOuter = lr.pressureOuter ?? lr.pressure;
    const lrInner = lr.pressureInner;
    const rrOuter = rr.pressureOuter ?? rr.pressure;
    const rrInner = rr.pressureInner;

    return (
      <div className="flex flex-col gap-2">
        <div className={tinyLabelClass()}>Tire Pressure</div>

        <div className="overflow-hidden rounded-xl border border-white/10 bg-black/35">
          <div className="grid grid-cols-2 gap-px bg-white/10">
            {/* LR Outer */}
            <div className="bg-black/40 p-2">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-400">
                  LR
                </span>
                <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">
                  Outer
                </span>
              </div>
              <div className="relative">
                <input
                  className={inputBaseClass()}
                  type="number"
                  inputMode="decimal"
                  placeholder={lrOuter ? "TP" : "—"}
                  value={String(lrOuter?.item?.value ?? "")}
                  onChange={(e) => commit(lrOuter, e.currentTarget.value)}
                  disabled={!lrOuter}
                />
                <span className={smallUnitClass()}>{unitFor("pressure")}</span>
              </div>
            </div>

            {/* RR Outer */}
            <div className="bg-black/40 p-2">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-400">
                  RR
                </span>
                <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">
                  Outer
                </span>
              </div>
              <div className="relative">
                <input
                  className={inputBaseClass()}
                  type="number"
                  inputMode="decimal"
                  placeholder={rrOuter ? "TP" : "—"}
                  value={String(rrOuter?.item?.value ?? "")}
                  onChange={(e) => commit(rrOuter, e.currentTarget.value)}
                  disabled={!rrOuter}
                />
                <span className={smallUnitClass()}>{unitFor("pressure")}</span>
              </div>
            </div>

            {/* LR Inner */}
            <div className="bg-black/40 p-2">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-400">
                  LR
                </span>
                <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">
                  Inner
                </span>
              </div>
              <div className="relative">
                <input
                  className={inputBaseClass()}
                  type="number"
                  inputMode="decimal"
                  placeholder={lrInner ? "TP" : "—"}
                  value={String(lrInner?.item?.value ?? "")}
                  onChange={(e) => commit(lrInner, e.currentTarget.value)}
                  disabled={!lrInner}
                />
                <span className={smallUnitClass()}>{unitFor("pressure")}</span>
              </div>
            </div>

            {/* RR Inner */}
            <div className="bg-black/40 p-2">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-400">
                  RR
                </span>
                <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">
                  Inner
                </span>
              </div>
              <div className="relative">
                <input
                  className={inputBaseClass()}
                  type="number"
                  inputMode="decimal"
                  placeholder={rrInner ? "TP" : "—"}
                  value={String(rrInner?.item?.value ?? "")}
                  onChange={(e) => commit(rrInner, e.currentTarget.value)}
                  disabled={!rrInner}
                />
                <span className={smallUnitClass()}>{unitFor("pressure")}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">
          If you want all 4 active, add labels like{" "}
          <span className="text-neutral-300">LR Tire Pressure (Inner/Outer)</span> and{" "}
          <span className="text-neutral-300">RR Tire Pressure (Inner/Outer)</span>.
        </div>
      </div>
    );
  };

  return (
    <div className="grid w-full gap-3">
      {/* Header / Collapse */}
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-400">
          Tire Grid – Hydraulic (sketch layout)
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
                    TP center • TD corners
                  </div>
                </div>

                {/* 3 columns: TD | TP cluster | TD */}
                <div className="grid grid-cols-[minmax(170px,1fr)_minmax(260px,1.2fr)_minmax(170px,1fr)] items-start gap-4">
                  {/* LF TD */}
                  {TDStack("LF", "LF Tread Depth")}

                  {/* TP split cluster */}
                  <FrontTPSplit />

                  {/* RF TD */}
                  {TDStack("RF", "RF Tread Depth")}
                </div>

                {/* Tall center spacer to visually match sketch */}
                <div className="mt-4 grid grid-cols-[minmax(170px,1fr)_minmax(260px,1.2fr)_minmax(170px,1fr)] gap-4">
                  <div />
                  <div className="h-[140px] w-full rounded-2xl border border-white/10 bg-black/25" />
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
                    TP center (quad) • TD corners
                  </div>
                </div>

                {/* 3 columns: TD | TP quad | TD */}
                <div className="grid grid-cols-[minmax(170px,1fr)_minmax(320px,1.4fr)_minmax(170px,1fr)] items-start gap-4">
                  {/* LR TD */}
                  {TDStack("LR", "LR Tread Depth")}

                  {/* TP quad cluster */}
                  <RearTPQuad />

                  {/* RR TD */}
                  {TDStack("RR", "RR Tread Depth")}
                </div>

                {/* Taller center body */}
                <div className="mt-4 grid grid-cols-[minmax(170px,1fr)_minmax(320px,1.4fr)_minmax(170px,1fr)] gap-4">
                  <div />
                  <div className="h-[170px] w-full rounded-2xl border border-white/10 bg-black/25" />
                  <div />
                </div>
              </div>

              {/* Unit hint */}
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