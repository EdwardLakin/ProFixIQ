//features/inspections/lib/inspection/ui/AirCornerGrid.tsx

"use client";

import { useMemo, useState } from "react";
import { useInspectionForm } from "@inspections/lib/inspection/ui/InspectionFormContext";
import type { InspectionItem } from "@inspections/lib/inspection/types";
import { handleMeasurementGridKeyDown } from "./measurementGridKeyboard";

type Props = {
  sectionIndex: number;
  items: InspectionItem[];
  unitHint?: (label: string) => string;
  onAddAxle?: (axleLabel: string) => void;
  /** Kept for API compatibility, but AirCornerGrid no longer renders spec buttons. */
  onSpecHint?: (metricLabel: string) => void;
};

type Side = "Left" | "Right";
type UnitMode = "standard" | "metric";

type Cell = {
  idx: number;
  axle: string;
  side: Side;
  metric: string;
  unit: string;
  fullLabel: string;
  initial: string;
};

type Row = {
  metric: string;
  left?: Cell;
  right?: Cell;
};

type AxleTable = {
  axle: string;
  rows: Row[];
};

const LABEL_RE = /^(?<axle>.+?)\s+(?<side>Left|Right)\s+(?<metric>.+)$/i;

// ✅ AirCornerGrid: pads/shoes/rotors/drums + push rod travel. NO torque.
const isAllowedAirMetric = (metric: string) => {
  const m = metric.toLowerCase();
  const isPadShoe = /(pad|lining|shoe)/i.test(m);
  const isRotorDrum = /(rotor|drum)/i.test(m);
  const isPushRod = /(push\s*rod)/i.test(m) && m.includes("travel");
  return isPadShoe || isRotorDrum || isPushRod;
};

const metricRank = (metric: string) => {
  const m = metric.toLowerCase();
  if (/(pad|lining|shoe)/i.test(m)) return 0;
  if (/(rotor|drum)/i.test(m)) return 1;
  if (/(push\s*rod)/i.test(m) && m.includes("travel")) return 2;
  return 999;
};

function axleSortScore(axle: string): number {
  const l = axle.toLowerCase().trim();
  if (l.startsWith("steer")) return 0;
  if (l.startsWith("drive")) return 1;
  if (l.startsWith("rear")) return 2;
  if (l.startsWith("tag")) return 3;
  if (l.startsWith("trailer")) return 4;
  return 9;
}

function modeHint(mode: UnitMode): string {
  // UI hint only (we are not converting values)
  return mode === "metric" ? "ENTER MM / KPA / N·M" : "ENTER IN / PSI / FT·LB";
}

export default function AirCornerGrid({
  sectionIndex,
  items,
  unitHint,
  onAddAxle,
}: Props) {
  const { updateItem } = useInspectionForm();
  const [unitMode, setUnitMode] = useState<UnitMode>("standard");

  const commit = (idx: number, value: string) => {
    updateItem(sectionIndex, idx, { value });
  };

  const tables = useMemo<AxleTable[]>(() => {
    const byAxle = new Map<string, Cell[]>();

    items.forEach((it, idx) => {
      const label = String(it.item ?? it.name ?? "").trim();
      if (!label) return;

      const m = label.match(LABEL_RE);
      if (!m?.groups) return;

      const axle = String(m.groups.axle ?? "").trim();
      const side = (String(m.groups.side ?? "") as Side) || "Left";
      const metric = String(m.groups.metric ?? "").trim();
      if (!axle || !metric) return;

      if (!isAllowedAirMetric(metric)) return;

      const hinted = unitHint ? unitHint(label) : "";
      const unit = String(it.unit ?? "").trim() || String(hinted ?? "").trim() || "";

      const cell: Cell = {
        idx,
        axle,
        side,
        metric,
        unit,
        fullLabel: label,
        initial: String(it.value ?? ""),
      };

      const arr = byAxle.get(axle) ?? [];
      arr.push(cell);
      byAxle.set(axle, arr);
    });

    const out: AxleTable[] = [];
    for (const [axle, cells] of byAxle.entries()) {
      const rowMap = new Map<string, Row>();

      for (const c of cells) {
        const key = c.metric.toLowerCase();
        const existing = rowMap.get(key) ?? { metric: c.metric };
        if (c.side === "Left") existing.left = c;
        else existing.right = c;
        rowMap.set(key, existing);
      }

      const rows = Array.from(rowMap.values()).sort((a, b) => {
        const ra = metricRank(a.metric);
        const rb = metricRank(b.metric);
        if (ra !== rb) return ra - rb;
        return a.metric.localeCompare(b.metric);
      });

      out.push({ axle, rows });
    }

    // ✅ Steer always first, then Drive, etc.
    out.sort((a, b) => {
      const sa = axleSortScore(a.axle);
      const sb = axleSortScore(b.axle);
      if (sa !== sb) return sa - sb;
      return a.axle.localeCompare(b.axle);
    });

    return out;
  }, [items, unitHint]);

  if (tables.length === 0) return null;

  return (
    <div
      className="grid w-full gap-3"
      data-inspection-corner-grid="air"
      data-inspection-measurement-grid
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setUnitMode("standard")}
            className={[
              "rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]",
              unitMode === "standard"
                ? "border-orange-500/70 bg-orange-500/10 text-[color:var(--theme-text-primary)]"
                : "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] text-[color:var(--theme-text-secondary)]",
            ].join(" ")}
          >
            Standard
          </button>
          <button
            type="button"
            onClick={() => setUnitMode("metric")}
            className={[
              "rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]",
              unitMode === "metric"
                ? "border-orange-500/70 bg-orange-500/10 text-[color:var(--theme-text-primary)]"
                : "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] text-[color:var(--theme-text-secondary)]",
            ].join(" ")}
          >
            Metric
          </button>
          <span className="hidden text-[10px] uppercase tracking-[0.14em] text-[color:var(--theme-text-muted)] md:inline">
            {modeHint(unitMode)}
          </span>
        </div>


      </div>

      {onAddAxle ? <AddAxlePicker tables={tables} onAddAxle={onAddAxle} /> : null}

      <div className="grid gap-3">
          {tables.map((t) => (
            <section
              key={t.axle}
              className="overflow-hidden rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)]"
              data-axle={t.axle}
            >
              <div className="flex items-center justify-between border-b border-[color:var(--theme-border-soft)] px-3 py-2">
                <div className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
                  {t.axle}
                </div>
                <div className="text-[10px] uppercase tracking-[0.14em] text-[color:var(--theme-text-muted)]">
                  Brake measurements
                </div>
              </div>

              <div className="hidden grid-cols-[minmax(120px,0.75fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3 border-b border-[color:var(--theme-border-soft)] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--theme-text-secondary)] sm:grid">
                <div>Measurement</div>
                <div>Left</div>
                <div>Right</div>
              </div>

              <div className="divide-y divide-[color:var(--theme-border-soft)]">
                {t.rows.map((row, rowIdx) => (
                  <div
                    key={`${row.metric}-${rowIdx}`}
                    className="grid gap-2 px-3 py-2 sm:grid-cols-[minmax(120px,0.75fr)_minmax(0,1fr)_minmax(0,1fr)] sm:items-center sm:gap-3"
                  >
                    <div className="text-xs font-semibold text-[color:var(--theme-text-primary)]">
                      {row.metric
                        .replace("Brake Pad / Shoe Thickness", "Pad / shoe")
                        .replace("Brake Drum / Rotor Thickness", "Drum / rotor")
                        .replace("Push Rod Travel", "Push rod travel")}
                    </div>

                    {(["Left", "Right"] as const).map((side) => {
                      const cell = side === "Left" ? row.left : row.right;
                      return (
                        <label
                          key={side}
                          className="grid min-w-0 grid-cols-[52px_minmax(0,1fr)] items-center gap-2 sm:block"
                        >
                          <span className="text-[10px] font-medium text-[color:var(--theme-text-secondary)] sm:hidden">
                            {side}
                          </span>
                          <div className="relative">
                            <input
                              defaultValue={cell?.initial ?? ""}
                              className="h-10 w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel-strong)] px-3 pr-12 text-sm text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)] focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/40 disabled:cursor-not-allowed disabled:opacity-50"
                              placeholder={cell ? "Enter value" : "—"}
                              autoComplete="off"
                              inputMode="decimal"
                              disabled={!cell}
                              onBlur={(e) => cell && commit(cell.idx, e.currentTarget.value)}
                              data-inspection-measurement-input="true"
                              onKeyDownCapture={handleMeasurementGridKeyDown}
                            />
                            {cell?.unit ? (
                              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium text-[color:var(--theme-text-secondary)]">
                                {cell.unit}
                              </span>
                            ) : null}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                ))}
              </div>
            </section>
          ))}
      </div>
    </div>
  );
}

function AddAxlePicker({
  tables,
  onAddAxle,
}: {
  tables: { axle: string }[];
  onAddAxle: (axleLabel: string) => void;
}) {
  const existing = useMemo(() => tables.map((t) => t.axle), [tables]);
  const [pending, setPending] = useState<string>("");

  const candidates = useMemo(() => {
    const wants: string[] = [];
    for (let i = 1; i <= 2; i++) wants.push(`Steer ${i}`);
    for (let i = 1; i <= 4; i++) wants.push(`Drive ${i}`);
    wants.push("Tag", "Trailer 1", "Trailer 2", "Trailer 3");
    return wants.filter((l) => !existing.includes(l));
  }, [existing]);

  return (
    <div className="flex items-center gap-2 px-1">
      <select
        className="rounded-full border border-[color:var(--metal-border-soft,var(--theme-border-soft))] bg-[color:var(--theme-surface-overlay)] px-3 py-1 text-xs text-[color:var(--theme-text-primary)] shadow-[var(--theme-shadow-medium)] focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/80"
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
        className="rounded-full bg-[linear-gradient(to_right,var(--accent-copper-soft,#e17a3e),var(--accent-copper,#f97316))] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-on-accent)] shadow-[0_0_18px_rgba(212,118,49,0.6)] hover:brightness-110 disabled:opacity-40"
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
