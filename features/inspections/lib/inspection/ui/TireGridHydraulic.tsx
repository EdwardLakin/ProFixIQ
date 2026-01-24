"use client";

import { useMemo } from "react";
import { useInspectionForm } from "@inspections/lib/inspection/ui/InspectionFormContext";
import type { InspectionItem } from "@inspections/lib/inspection/types";

const POSITIONS = ["LF", "RF", "LR", "RR"] as const;
type Position = (typeof POSITIONS)[number];

const HYD_TIRE_RE = /^(?<pos>LF|RF|LR|RR)\s+(?<metric>.+)$/i;

type Cell = {
  idx: number;
  pos: Position;
  metric: string;
  item: InspectionItem;
};

export default function TireGridHydraulic(props: {
  sectionIndex: number;
  items: InspectionItem[];
}) {
  const { sectionIndex, items } = props;
  const { updateItem } = useInspectionForm();

  const parsed = useMemo(() => {
    const cells: Cell[] = [];
    const metricsSet = new Set<string>();

    items.forEach((it, idx) => {
      const raw = String(it.item ?? it.name ?? "").trim();
      const m = raw.match(HYD_TIRE_RE);
      if (!m?.groups) return;

      const pos = String(m.groups.pos || "").toUpperCase() as Position;
      const metric = String(m.groups.metric || "").trim();
      if (!POSITIONS.includes(pos) || !metric) return;

      metricsSet.add(metric);
      cells.push({ idx, pos, metric, item: it });
    });

    const metrics = Array.from(metricsSet.values());
    metrics.sort((a, b) => a.localeCompare(b));

    const byMetric = new Map<string, Record<Position, Cell | null>>();
    for (const metric of metrics) {
      byMetric.set(metric, { LF: null, RF: null, LR: null, RR: null });
    }
    for (const c of cells) {
      const row = byMetric.get(c.metric);
      if (!row) continue;
      row[c.pos] = c;
    }

    return { metrics, byMetric };
  }, [items]);

  if (parsed.metrics.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-black/40 p-3 text-sm text-neutral-300">
        No hydraulic tire-grid items detected (expected labels like{" "}
        <code className="text-neutral-100">LF Tire Pressure</code>).
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-black/35 shadow-[0_12px_35px_rgba(0,0,0,0.55)]">
      <div className="grid grid-cols-[minmax(160px,1fr)_repeat(4,minmax(0,1fr))] gap-px bg-white/10">
        <div className="bg-black/60 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-300">
          Metric
        </div>
        {POSITIONS.map((p) => (
          <div
            key={p}
            className="bg-black/60 px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-300"
          >
            {p}
          </div>
        ))}

        {parsed.metrics.map((metric) => {
          const row = parsed.byMetric.get(metric);

          return (
            <div key={metric} className="contents">
              <div className="bg-black/45 px-3 py-2 text-[12px] font-medium text-neutral-100">
                {metric}
              </div>

              {POSITIONS.map((p) => {
                const cell = row ? row[p] : null;
                const v = cell?.item?.value ?? "";

                return (
                  <div key={p} className="bg-black/25 px-2 py-2">
                    <input
                      type="number"
                      inputMode="decimal"
                      className="w-full rounded-md border border-white/10 bg-black/60 px-2 py-1 text-[12px] text-white placeholder:text-neutral-500 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/60"
                      value={String(v ?? "")}
                      onChange={(e) => {
                        if (!cell) return;
                        updateItem(sectionIndex, cell.idx, {
                          value: e.currentTarget.value,
                        });
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