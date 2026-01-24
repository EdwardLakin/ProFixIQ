"use client";

import { useMemo } from "react";
import { useInspectionForm } from "@inspections/lib/inspection/ui/InspectionFormContext";
import type { InspectionItem } from "@inspections/lib/inspection/types";

type CornerGridProps = {
  sectionIndex: number;
  items: InspectionItem[];
  unitHint?: (label: string) => string;
  onSpecHint?: (label: string) => void;
};

const CORNERS = ["LF", "RF", "LR", "RR"] as const;
const HYD_ITEM_RE = /^(?<corner>LF|RF|LR|RR)\s+(?<metric>.+)$/i;

type Corner = (typeof CORNERS)[number];

type Cell = {
  idx: number;
  corner: Corner;
  metric: string;
  item: InspectionItem;
};

function isAllowedCornerMetric(metric: string): boolean {
  const m = metric.toLowerCase();
  const isPadShoe = /(pad|lining|shoe)/i.test(m);
  const isRotorDrum = /(rotor|drum)/i.test(m);
  return isPadShoe || isRotorDrum;
}

function cornerMetricRank(metric: string): number {
  const m = metric.toLowerCase();
  if (/(pad|lining|shoe)/i.test(m)) return 0;
  if (/(rotor|drum)/i.test(m)) return 1;
  return 999;
}

export default function CornerGrid(props: CornerGridProps) {
  const { sectionIndex, items, unitHint, onSpecHint } = props;
  const { updateItem } = useInspectionForm();

  const parsed = useMemo(() => {
    const cells: Cell[] = [];
    const metricsSet = new Set<string>();

    items.forEach((it, idx) => {
      const raw = String(it.item ?? it.name ?? "").trim();
      const m = raw.match(HYD_ITEM_RE);
      if (!m?.groups) return;

      const corner = String(m.groups.corner || "").toUpperCase() as Corner;
      const metric = String(m.groups.metric || "").trim();
      if (!CORNERS.includes(corner) || !metric) return;

      if (!isAllowedCornerMetric(metric)) return;

      metricsSet.add(metric);
      cells.push({ idx, corner, metric, item: it });
    });

    const metrics = Array.from(metricsSet.values()).sort((a, b) => {
      const ra = cornerMetricRank(a);
      const rb = cornerMetricRank(b);
      if (ra !== rb) return ra - rb;
      return a.localeCompare(b);
    });

    const byMetric = new Map<string, Record<Corner, Cell | null>>();
    for (const metric of metrics) {
      byMetric.set(metric, { LF: null, RF: null, LR: null, RR: null });
    }

    for (const c of cells) {
      const row = byMetric.get(c.metric);
      if (!row) continue;
      if (!row[c.corner]) row[c.corner] = c;
    }

    return { metrics, byMetric };
  }, [items]);

  if (parsed.metrics.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-black/40 p-3 text-sm text-neutral-300">
        No corner-grid items detected (expected LF/RF/LR/RR with Pads/Shoes + Rotor/Drum).
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-black/35 shadow-[0_12px_35px_rgba(0,0,0,0.55)]">
      <div className="grid grid-cols-[minmax(160px,1fr)_repeat(4,minmax(0,1fr))] gap-px bg-white/10">
        <div className="bg-black/60 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-300">
          Metric
        </div>
        {CORNERS.map((c) => (
          <div
            key={c}
            className="bg-black/60 px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-300"
          >
            {c}
          </div>
        ))}

        {parsed.metrics.map((metric) => {
          const row = parsed.byMetric.get(metric);
          const hint = unitHint ? unitHint(metric) : "";

          return (
            <div key={metric} className="contents">
              <div className="bg-black/45 px-3 py-2 text-[12px] text-neutral-100">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{metric}</span>
                  {hint ? (
                    <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">
                      {hint}
                    </span>
                  ) : null}
                </div>
              </div>

              {CORNERS.map((corner) => {
                const cell = row ? row[corner] : null;
                const value = cell?.item?.value ?? "";

                return (
                  <div key={corner} className="bg-black/25 px-2 py-2">
                    <input
                      type="number"
                      inputMode="decimal"
                      className="w-full rounded-md border border-white/10 bg-black/60 px-2 py-1 text-[12px] text-white placeholder:text-neutral-500 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/60"
                      value={String(value ?? "")}
                      onFocus={() => onSpecHint?.(metric)}
                      onChange={(e) => {
                        if (!cell) return;
                        updateItem(sectionIndex, cell.idx, { value: e.currentTarget.value });
                      }}
                      placeholder="—"
                      disabled={!cell}
                    />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}