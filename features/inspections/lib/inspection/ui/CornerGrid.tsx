//features/inspections/lib/inspection/ui/CornerGrid.tsx

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

const CORNER_LABEL: Record<Corner, string> = {
  LF: "Left Front",
  RF: "Right Front",
  LR: "Left Rear",
  RR: "Right Rear",
};

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
    "h-10 w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel-strong)]",
    "px-3 py-1.5 pr-11 text-sm text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)]",
    "focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/40",
  ].join(" ");
}

function unitCls() {
  return "pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium text-[color:var(--theme-text-secondary)]";
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

      const unit =
        (unitHint ? unitHint(metric) : "").trim() ||
        (it.unit ?? "").trim() ||
        "mm";

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

    const hasAny = CORNERS.some(
      (corner) => !!(byCorner[corner].pads || byCorner[corner].rotor),
    );
    return { byCorner, hasAny };
  }, [items, unitHint]);

  if (!parsed.hasAny) {
    return (
      <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3 text-sm text-[color:var(--theme-text-secondary)]">
        No corner-grid items detected (expected{" "}
        <code className="text-[color:var(--theme-text-primary)]">LF/RF/LR/RR</code> with Pads/Shoes + Rotor/Drum).
      </div>
    );
  }

  const commit = (cell: Cell | undefined, value: string) => {
    if (!cell) return;
    onSpecHint?.(cell.metricLabel);
    updateItem(sectionIndex, cell.idx, { value });
  };

  const Stack = (corner: Corner) => {
    const bucket = parsed.byCorner[corner];
    const pads = bucket.pads;
    const rotor = bucket.rotor;

    return (
      <div className="min-w-0 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2 border-b border-[color:var(--theme-border-soft)] pb-2">
          <div>
            <div className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
              {CORNER_LABEL[corner]}
            </div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
              {corner}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <label className="block min-w-0">
            <span className="mb-1 block text-[11px] font-medium text-[color:var(--theme-text-secondary)]">
              Pad / shoe thickness
            </span>
            <div className="relative">
              <input
                className={inputCls()}
                type="number"
                inputMode="decimal"
                placeholder={pads ? "Enter value" : "Not configured"}
                defaultValue={String(pads?.item?.value ?? "")}
                onFocus={() => pads && onSpecHint?.(pads.metricLabel)}
                onBlur={(event) => commit(pads, event.currentTarget.value)}
                disabled={!pads}
              />
              <span className={unitCls()}>{pads?.unit ?? "mm"}</span>
            </div>
          </label>

          <label className="block min-w-0">
            <span className="mb-1 block text-[11px] font-medium text-[color:var(--theme-text-secondary)]">
              Rotor / drum thickness
            </span>
            <div className="relative">
              <input
                className={inputCls()}
                type="number"
                inputMode="decimal"
                placeholder={rotor ? "Enter value" : "Not configured"}
                defaultValue={String(rotor?.item?.value ?? "")}
                onFocus={() => rotor && onSpecHint?.(rotor.metricLabel)}
                onBlur={(event) => commit(rotor, event.currentTarget.value)}
                disabled={!rotor}
              />
              <span className={unitCls()}>{rotor?.unit ?? "mm"}</span>
            </div>
          </label>
        </div>
      </div>
    );
  };

  return (
    <div className="grid w-full gap-3" data-inspection-corner-grid="hydraulic">
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div>
          <div className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
            Hydraulic brake measurements
          </div>
          <div className="mt-0.5 text-[11px] text-[color:var(--theme-text-secondary)]">
            Enter pad/shoe and rotor/drum measurements by wheel position.
          </div>
        </div>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-primary)] hover:border-orange-500/70 hover:bg-[color:var(--theme-surface-overlay)]"
          aria-expanded={open}
          title={open ? "Collapse" : "Expand"}
          tabIndex={-1}
        >
          {open ? "Collapse" : "Expand"}
        </button>
      </div>

      {open ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
          {CORNERS.map((corner) => (
            <div key={corner}>{Stack(corner)}</div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
