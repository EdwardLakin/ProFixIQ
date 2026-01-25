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
  pressure?: Cell;
  treadOuter?: Cell;
  treadInner?: Cell;
};

const LABEL_RE = /^(?<pos>LF|RF|LR|RR)\s+(?<metric>.+)$/i;

type MetricKind = "pressure" | "treadOuter" | "treadInner" | "other";

function metricKindFrom(metricRaw: string): MetricKind {
  const m = metricRaw.trim().toLowerCase();

  // pressure
  if (m.includes("tire pressure") || m === "pressure" || m.includes("pressure")) {
    return "pressure";
  }

  // tread
  if (m.includes("tread")) {
    if (m.includes("outer")) return "treadOuter";
    if (m.includes("inner")) return "treadInner";
    // If no explicit inner/outer, default to outer
    return "treadOuter";
  }

  return "other";
}

function unitFor(kind: MetricKind): string {
  if (kind === "pressure") return "psi";
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
  ].join(" ");
}

function smallUnitClass() {
  return "pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-neutral-400";
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

      // Prefer first match (stable) to avoid duplicates overwriting
      const bucket = byPos[pos];
      if (kind === "pressure" && !bucket.pressure) bucket.pressure = cell;
      if (kind === "treadOuter" && !bucket.treadOuter) bucket.treadOuter = cell;
      if (kind === "treadInner" && !bucket.treadInner) bucket.treadInner = cell;
    });

    const hasAny = POSITIONS.some((p) => {
      const b = byPos[p];
      return !!(b.pressure || b.treadOuter || b.treadInner);
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

  const TDBox = (pos: Position) => {
    const b = parsed.byPos[pos];
    const hasOuter = !!b.treadOuter;
    const hasInner = !!b.treadInner;

    return (
      <div className="flex flex-col gap-2">
        {/* Outer */}
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

        {/* Inner (only if exists in template) */}
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

  const TPBox = (pos: Position) => {
    const b = parsed.byPos[pos];
    return (
      <div className="relative">
        <input
          className={inputBaseClass()}
          type="number"
          inputMode="decimal"
          placeholder={b.pressure ? "TP" : "—"}
          value={String(b.pressure?.item?.value ?? "")}
          onChange={(e) => commit(b.pressure, e.currentTarget.value)}
          disabled={!b.pressure}
        />
        <span className={smallUnitClass()}>{unitFor("pressure")}</span>
      </div>
    );
  };

  return (
    <div className="grid w-full gap-3">
      {/* Header / Collapse */}
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-400">
          Tire Grid – Hydraulic (layout)
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
            {/* Top-down vehicle layout */}
            <div className="grid gap-6">
              {/* FRONT (LF/RF) */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <div
                    className="text-sm font-semibold uppercase tracking-[0.18em] text-[color:var(--accent-copper,#f97316)]"
                    style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}
                  >
                    Front
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">
                    TD at corners • TP center
                  </div>
                </div>

                {/* 5 columns: TD | TP | spacer | TP | TD  */}
                <div className="grid grid-cols-[minmax(140px,1fr)_minmax(130px,1fr)_48px_minmax(130px,1fr)_minmax(140px,1fr)] items-start gap-3">
                  {/* LF TD */}
                  <div>
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-400">
                      LF TD
                    </div>
                    {TDBox("LF")}
                  </div>

                  {/* LF TP */}
                  <div>
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-400">
                      LF TP
                    </div>
                    {TPBox("LF")}
                  </div>

                  {/* center spacer (truck body) */}
                  <div className="flex h-full items-center justify-center">
                    <div className="h-[110px] w-full rounded-xl border border-white/10 bg-black/25" />
                  </div>

                  {/* RF TP */}
                  <div>
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-400">
                      RF TP
                    </div>
                    {TPBox("RF")}
                  </div>

                  {/* RF TD */}
                  <div>
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-400">
                      RF TD
                    </div>
                    {TDBox("RF")}
                  </div>
                </div>
              </div>

              {/* REAR (LR/RR) */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <div
                    className="text-sm font-semibold uppercase tracking-[0.18em] text-[color:var(--accent-copper,#f97316)]"
                    style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}
                  >
                    Rear
                  </div>
                </div>

                <div className="grid grid-cols-[minmax(140px,1fr)_minmax(130px,1fr)_48px_minmax(130px,1fr)_minmax(140px,1fr)] items-start gap-3">
                  {/* LR TD */}
                  <div>
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-400">
                      LR TD
                    </div>
                    {TDBox("LR")}
                  </div>

                  {/* LR TP */}
                  <div>
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-400">
                      LR TP
                    </div>
                    {TPBox("LR")}
                  </div>

                  {/* center spacer */}
                  <div className="flex h-full items-center justify-center">
                    <div className="h-[110px] w-full rounded-xl border border-white/10 bg-black/25" />
                  </div>

                  {/* RR TP */}
                  <div>
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-400">
                      RR TP
                    </div>
                    {TPBox("RR")}
                  </div>

                  {/* RR TD */}
                  <div>
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-400">
                      RR TD
                    </div>
                    {TDBox("RR")}
                  </div>
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