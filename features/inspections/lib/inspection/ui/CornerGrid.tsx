//features/inspections/lib/inspection/ui/CornerGrid.tsx

"use client";

import { useMemo } from "react";
import { useInspectionForm } from "@inspections/lib/inspection/ui/InspectionFormContext";
import type { InspectionItem } from "@inspections/lib/inspection/types";
import { handleMeasurementGridKeyDown } from "./measurementGridKeyboard";

type CornerGridProps = {
  sectionIndex: number;
  items: InspectionItem[];
  unitHint?: (label: string) => string;
  onSpecHint?: (label: string) => void;
  locked?: boolean;
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
  const { sectionIndex, items, unitHint, onSpecHint, locked } = props;
  const { updateItem } = useInspectionForm();

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

  const renderCellInput = (cell?: Cell) => (
    <div className="relative min-w-0">
      <input
        className={inputCls()}
        type="number"
        inputMode="decimal"
        step="any"
        placeholder={cell ? "Enter value" : "—"}
        value={String(cell?.item?.value ?? "")}
        onFocus={() => cell && onSpecHint?.(cell.metricLabel)}
        onChange={(event) => commit(cell, event.currentTarget.value)}
        disabled={!cell || locked}
        autoComplete="off"
        data-inspection-measurement-input="true"
        onKeyDown={handleMeasurementGridKeyDown}
      />
      <span className={unitCls()}>{cell?.unit ?? "mm"}</span>
    </div>
  );

  return (
    <div className="grid w-full gap-3" data-inspection-corner-grid="hydraulic">
        <div data-inspection-measurement-grid className="overflow-hidden rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)]">
          <div className="hidden grid-cols-[minmax(130px,0.8fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3 border-b border-[color:var(--theme-border-soft)] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--theme-text-secondary)] sm:grid">
            <div>Position</div>
            <div>Pad / shoe thickness</div>
            <div>Rotor / drum thickness</div>
          </div>

          <div className="divide-y divide-[color:var(--theme-border-soft)]">
            {CORNERS.map((corner) => {
              const bucket = parsed.byCorner[corner];
              return (
                <div
                  key={corner}
                  className="grid gap-2 px-3 py-2.5 sm:grid-cols-[minmax(130px,0.8fr)_minmax(0,1fr)_minmax(0,1fr)] sm:items-center sm:gap-3"
                  data-brake-position={corner}
                >
                  <div className="flex items-baseline justify-between gap-2 sm:block">
                    <div className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
                      {CORNER_LABEL[corner]}
                    </div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-muted)]">
                      {corner}
                    </div>
                  </div>

                  <label className="grid min-w-0 grid-cols-[92px_minmax(0,1fr)] items-center gap-2 sm:block">
                    <span className="text-[10px] font-medium text-[color:var(--theme-text-secondary)] sm:hidden">
                      Pad / shoe
                    </span>
                    {renderCellInput(bucket.pads)}
                  </label>

                  <label className="grid min-w-0 grid-cols-[92px_minmax(0,1fr)] items-center gap-2 sm:block">
                    <span className="text-[10px] font-medium text-[color:var(--theme-text-secondary)] sm:hidden">
                      Rotor / drum
                    </span>
                    {renderCellInput(bucket.rotor)}
                  </label>
                </div>
              );
            })}
          </div>
        </div>
    </div>
  );
}
