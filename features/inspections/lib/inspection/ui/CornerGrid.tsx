"use client";

import { useMemo, useState } from "react";
import { useInspectionForm } from "@inspections/lib/inspection/ui/InspectionFormContext";
import type { InspectionItem } from "@inspections/lib/inspection/types";

type CornerGridProps = {
  sectionIndex: number;
  items: InspectionItem[];
  unitHint?: (label: string) => string;
  onSpecHint?: (label: string) => void;
};

const CORNERS = ["LF", "RF", "LR", "RR"] as const;
type Corner = (typeof CORNERS)[number];

const HYD_ITEM_RE = /^(?<corner>LF|RF|LR|RR)\s+(?<metric>.+)$/i;

type MetricKind = "pads" | "rotor" | "other";

type Cell = {
  idx: number;
  corner: Corner;
  kind: MetricKind;
  metricLabel: string;
  item: InspectionItem;
  unit: string;
};

function metricKindFrom(metric: string): MetricKind {
  const m = metric.toLowerCase();

  const isPadShoe = /(pad|lining|shoe)/i.test(m);
  if (isPadShoe) return "pads";

  const isRotorDrum = /(rotor|drum)/i.test(m);
  if (isRotorDrum) return "rotor";

  return "other";
}

function normalizeMetricLabel(metric: string): string {
  const m = metric.toLowerCase();
  if (/(pad|lining|shoe)/i.test(m)) return "Brake Pad / Shoe Thickness";
  if (/(rotor|drum)/i.test(m)) return "Rotor / Drum Thickness";
  return metric.trim();
}

function inputCls() {
  return [
    "h-[34px] w-full rounded-lg border border-white/10 bg-black/55",
    "px-3 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-500",
    "focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/70",
  ].join(" ");
}

function unitCls() {
  return "pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-neutral-400";
}

function cornerShellCls() {
  return "rounded-2xl border border-white/10 bg-black/35 shadow-[0_18px_45px_rgba(0,0,0,0.75)] backdrop-blur-xl";
}

export default function CornerGrid(props: CornerGridProps) {
  const { sectionIndex, items, unitHint, onSpecHint } = props;
  const { updateItem } = useInspectionForm();
  const [open, setOpen] = useState(true);

  const parsed = useMemo(() => {
    const byCorner: Record<Corner, { pads?: Cell; rotor?: Cell }> = {
      LF: {},
      RF: {},
      LR: {},
      RR: {},
    };

    items.forEach((it, idx) => {
      const raw = String(it.item ?? it.name ?? "").trim();
      const m = raw.match(HYD_ITEM_RE);
      if (!m?.groups) return;

      const corner = String(m.groups.corner || "").toUpperCase() as Corner;
      const metric = String(m.groups.metric || "").trim();
      if (!CORNERS.includes(corner) || !metric) return;

      const kind = metricKindFrom(metric);
      if (kind === "other") return;

      const unit = (unitHint ? unitHint(metric) : "").trim() || (it.unit ?? "").trim() || "mm";

      const cell: Cell = {
        idx,
        corner,
        kind,
        metricLabel: normalizeMetricLabel(metric),
        item: it,
        unit,
      };

      const bucket = byCorner[corner];
      if (kind === "pads" && !bucket.pads) bucket.pads = cell;
      if (kind === "rotor" && !bucket.rotor) bucket.rotor = cell;
    });

    const hasAny = CORNERS.some((c) => !!(byCorner[c].pads || byCorner[c].rotor));
    return { byCorner, hasAny };
  }, [items, unitHint]);

  if (!parsed.hasAny) {
    return (
      <div className="rounded-xl border border-white/10 bg-black/40 p-3 text-sm text-neutral-300">
        No corner-grid items detected (expected{" "}
        <code className="text-neutral-100">LF/RF/LR/RR</code> with Pads/Shoes + Rotor/Drum).
      </div>
    );
  }

  const commit = (cell: Cell | undefined, value: string) => {
    if (!cell) return;
    onSpecHint?.(cell.metricLabel);
    updateItem(sectionIndex, cell.idx, { value });
  };

  const Stack = (corner: Corner) => {
    const b = parsed.byCorner[corner];
    const pads = b.pads;
    const rotor = b.rotor;

    return (
      <div className="flex flex-col gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-400">
          {corner}
        </div>

        {/* Pads/Shoes */}
        <div className="relative">
          <input
            className={inputCls()}
            type="number"
            inputMode="decimal"
            placeholder={pads ? "Pads/Shoes" : "—"}
            value={String(pads?.item?.value ?? "")}
            onFocus={() => pads && onSpecHint?.(pads.metricLabel)}
            onChange={(e) => commit(pads, e.currentTarget.value)}
            disabled={!pads}
          />
          <span className={unitCls()}>{pads?.unit ?? "mm"}</span>
        </div>

        {/* Rotor/Drum */}
        <div className="relative">
          <input
            className={inputCls()}
            type="number"
            inputMode="decimal"
            placeholder={rotor ? "Rotor/Drum" : "—"}
            value={String(rotor?.item?.value ?? "")}
            onFocus={() => rotor && onSpecHint?.(rotor.metricLabel)}
            onChange={(e) => commit(rotor, e.currentTarget.value)}
            disabled={!rotor}
          />
          <span className={unitCls()}>{rotor?.unit ?? "mm"}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="grid w-full gap-3">
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-400">
          Corner Grid – Hydraulic Brakes (sketch layout)
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
        <div className={["p-4", cornerShellCls()].join(" ")}>
          <div className="grid gap-6">
            {/* FRONT */}
            <div>
              <div
                className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-[color:var(--accent-copper,#f97316)]"
                style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}
              >
                Front
              </div>

              {/* LF | spacer(body) | RF */}
              <div className="grid grid-cols-[minmax(170px,1fr)_64px_minmax(170px,1fr)] items-start gap-3">
                {Stack("LF")}
                <div className="flex h-full items-center justify-center">
                  <div className="h-[110px] w-full rounded-xl border border-white/10 bg-black/25" />
                </div>
                {Stack("RF")}
              </div>
            </div>

            {/* REAR */}
            <div>
              <div
                className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-[color:var(--accent-copper,#f97316)]"
                style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}
              >
                Rear
              </div>

              {/* LR | spacer(body) | RR */}
              <div className="grid grid-cols-[minmax(170px,1fr)_64px_minmax(170px,1fr)] items-start gap-3">
                {Stack("LR")}
                <div className="flex h-full items-center justify-center">
                  <div className="h-[110px] w-full rounded-xl border border-white/10 bg-black/25" />
                </div>
                {Stack("RR")}
              </div>
            </div>

            {/* Labels legend */}
            <div className="pt-1 text-[10px] uppercase tracking-[0.16em] text-neutral-500">
              Pads/Shoes + Rotor/Drum are stacked per corner (matches sketch)
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}