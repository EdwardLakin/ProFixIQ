"use client";

import { useMemo } from "react";
import { useInspectionForm } from "@inspections/lib/inspection/ui/InspectionFormContext";
import type { InspectionItem } from "@inspections/lib/inspection/types";

const POSITIONS = ["LF", "RF", "LR", "RR"] as const;
type Position = (typeof POSITIONS)[number];


type RowKey = "Tire Pressure" | "Tread Depth (Outer)" | "Tread Depth (Inner)";

type Cell = {
  idx: number;
  pos: Position;
  row: RowKey;
  item: InspectionItem;
};

const LABEL_RE = /^(?<pos>LF|RF|LR|RR)\s+(?<metric>.+)$/i;

function normalizeRow(metricRaw: string): RowKey | null {
  const m = metricRaw.trim().toLowerCase();

  // pressure
  if (m.includes("tire pressure") || m === "pressure") return "Tire Pressure";

  // tread
  if (m.includes("tread")) {
    if (m.includes("outer")) return "Tread Depth (Outer)";
    if (m.includes("inner")) return "Tread Depth (Inner)";
    // If no pos, default it to outer row (common label "Tread Depth")
    return "Tread Depth (Outer)";
  }

  return null;
}

function unitForRow(row: RowKey): string {
  if (row === "Tire Pressure") return "psi";
  return "mm";
}

export default function TireGridHydraulic(props: {
  sectionIndex: number;
  items: InspectionItem[];
}) {
  const { sectionIndex, items } = props;
  const { updateItem } = useInspectionForm();

  const parsed = useMemo(() => {
    const cells: Cell[] = [];
    const byRow = new Map<RowKey, Record<Position, Cell | null>>();

    const rows: RowKey[] = ["Tire Pressure", "Tread Depth (Outer)", "Tread Depth (Inner)"];
    rows.forEach((r) => {
      byRow.set(r, { LF: null, RF: null, LR: null, RR: null });
    });

    items.forEach((it, idx) => {
      const raw = String(it.item ?? it.name ?? "").trim();
      const m = raw.match(LABEL_RE);
      if (!m?.groups) return;

      const pos = String(m.groups.pos || "").toUpperCase() as Position;
      const metric = String(m.groups.metric || "").trim();
      if (!POSITIONS.includes(pos) || !metric) return;

      const row = normalizeRow(metric);
      if (!row) return;

      const cell: Cell = { idx, pos, row, item: it };
      cells.push(cell);

      const bucket = byRow.get(row);
      if (!bucket) return;

      // If duplicates exist, prefer the first (stable)
      if (!bucket[pos]) bucket[pos] = cell;
    });

    const hasAny = rows.some((r) => {
      const row = byRow.get(r);
      return !!row && POSITIONS.some((p) => !!row[p]);
    });

    return { rows, byRow, hasAny };
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

        {parsed.rows.map((rowKey) => {
          const row = parsed.byRow.get(rowKey);

          return (
            <div key={rowKey} className="contents">
              <div className="bg-black/45 px-3 py-2 text-[12px] font-medium text-neutral-100">
                <div className="flex items-center justify-between gap-2">
                  <span>{rowKey}</span>
                  <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">
                    {unitForRow(rowKey)}
                  </span>
                </div>
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