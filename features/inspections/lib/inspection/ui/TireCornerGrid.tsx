// features/inspections/lib/inspection/ui/TireCornerGrid.tsx
"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useInspectionForm } from "@inspections/lib/inspection/ui/InspectionFormContext";
import type { InspectionItem } from "@inspections/lib/inspection/types";

type Props = {
  sectionIndex: number;
  items: InspectionItem[];
  unitHint?: (label: string) => string;

  /**
   * Optional hook so the parent can add an axle group to the underlying template
   * (same concept as AirCornerGrid). If omitted, we just render what exists.
   */
  onAddAxle?: (axleLabel: string) => void;

  /** Optional: show CVIP spec for a metric label (e.g. "Tire Pressure"). */
  onSpecHint?: (metricLabel: string) => void;
};

type Side = "Left" | "Right";

type MetricCell = {
  metric: string;
  idx: number;
  unit: string;
  fullLabel: string;
  initial: string;
  isPressure: boolean;
  isTread: boolean;
};

type AxleGroup = { axle: string; left: MetricCell[]; right: MetricCell[] };

type RowTriplet = { metric: string; left?: MetricCell; right?: MetricCell };

// Label format expected:
// "<Axle> Left <Metric>" or "<Axle> Right <Metric>"
// Example: "Steer 1 Left Tire Pressure" / "Drive 1 Right Tire Tread (Outer)"
const labelRe = /^(?<axle>.+?)\s+(?<side>Left|Right)\s+(?<metric>.+)$/i;

const tirePriority = (metric: string): [number, number] => {
  const m = metric.toLowerCase();

  if (/tire\s*pressure/i.test(m)) {
    // Outer before Inner when both exist
    const second = /outer/i.test(m) ? 0 : /inner/i.test(m) ? 1 : 0;
    return [0, second];
  }

  if (/(tire\s*)?tread\s*depth|tire\s*tread/i.test(m)) {
    const second = /outer/i.test(m) ? 0 : /inner/i.test(m) ? 1 : 0;
    return [1, second];
  }

  // Anything else stays at the bottom (future-proof)
  return [99, 0];
};

const orderCompare = (a: string, b: string) => {
  const [pa, sa] = tirePriority(a);
  const [pb, sb] = tirePriority(b);
  return pa !== pb ? pa - pb : sa - sb;
};

const isDualAxle = (axleLabel: string) => {
  const a = axleLabel.toLowerCase();
  if (a.startsWith("drive") || a.startsWith("trailer") || a.includes("rear"))
    return true;
  if (a.startsWith("tag") || a.startsWith("steer")) return false;
  return false;
};

const isDualizableMetric = (metric: string) =>
  /tire\s*pressure/i.test(metric) ||
  /(tire\s*)?tread\s*depth|tire\s*tread/i.test(metric);

const hasInnerOuter = (metric: string) => /(inner|outer)/i.test(metric);

function expandDuals(axle: string, cells: MetricCell[]): MetricCell[] {
  if (!isDualAxle(axle)) return cells;

  const out: MetricCell[] = [];
  for (const c of cells) {
    if (isDualizableMetric(c.metric) && !hasInnerOuter(c.metric)) {
      const base = c.metric.replace(/\s*\((inner|outer)\)\s*/i, "").trim();
      // Keep same idx/initial: these are "virtual splits" so UI can be dual-aware.
      // Real templates can later include explicit inner/outer items.
      out.push({ ...c, metric: `${base} (Outer)` });
      out.push({ ...c, metric: `${base} (Inner)` });
    } else {
      out.push(c);
    }
  }
  return out;
}

function buildTriplets(g: AxleGroup): RowTriplet[] {
  const map = new Map<string, RowTriplet>();
  const add = (c: MetricCell, which: "left" | "right") => {
    const k = c.metric.toLowerCase();
    const existing = map.get(k) || { metric: c.metric };
    map.set(k, { ...existing, metric: c.metric, [which]: c });
  };
  g.left.forEach((c) => add(c, "left"));
  g.right.forEach((c) => add(c, "right"));
  return Array.from(map.values()).sort((a, b) =>
    orderCompare(a.metric, b.metric),
  );
}

export default function TireCornerGrid({
  sectionIndex,
  items,
  unitHint,
  onAddAxle,
  onSpecHint,
}: Props) {
  const { updateItem } = useInspectionForm();

  const [open, setOpen] = useState(true);
  const [showKpa, setShowKpa] = useState(true);

  const [filledMap, setFilledMap] = useState<Record<number, boolean>>(() => {
    const m: Record<number, boolean> = {};
    items.forEach((it, i) => (m[i] = !!String(it.value ?? "").trim()));
    return m;
  });

  const commit = (idx: number, el: HTMLInputElement | null) => {
    if (!el) return;
    const value = el.value;
    updateItem(sectionIndex, idx, { value });
    const has = value.trim().length > 0;
    setFilledMap((p) => (p[idx] === has ? p : { ...p, [idx]: has }));
  };

  const count = (cells: MetricCell[]) =>
    cells.reduce((a, r) => a + (filledMap[r.idx] ? 1 : 0), 0);

  const groups: AxleGroup[] = useMemo(() => {
    const byAxle = new Map<string, { Left: MetricCell[]; Right: MetricCell[] }>();

    items.forEach((it, idx) => {
      const label = it.item ?? "";
      const m = label.match(labelRe);
      if (!m?.groups) return;

      const axle = m.groups.axle.trim();
      const side = (m.groups.side as Side) || "Left";
      const metric = m.groups.metric.trim();

      if (!byAxle.has(axle)) byAxle.set(axle, { Left: [], Right: [] });

      const unit =
        (it.unit ?? "") || (unitHint ? unitHint(label) : "") || "";

      const cell: MetricCell = {
        metric,
        idx,
        unit,
        fullLabel: label,
        initial: String(it.value ?? ""),
        isPressure: /pressure/i.test(metric),
        isTread: /(tread\s*depth|tire\s*tread)/i.test(metric),
      };

      byAxle.get(axle)![side].push(cell);
    });

    return Array.from(byAxle.entries()).map(([axle, sides]) => {
      const left = expandDuals(axle, sides.Left).sort((a, b) =>
        orderCompare(a.metric, b.metric),
      );
      const right = expandDuals(axle, sides.Right).sort((a, b) =>
        orderCompare(a.metric, b.metric),
      );
      return { axle, left, right };
    });
  }, [items, unitHint]);

  const kpaFromPsi = (psiStr: string) => {
    const n = Number(psiStr);
    return Number.isFinite(n) ? Math.round(n * 6.894757) : null;
  };

  // ✅ Keep TAB focus cycling inside each axle card grid
  // refsByAxle[axleIndex][rowIndex][colIndex(0=left,1=right)]
  const refsByAxle = useRef<(HTMLInputElement | null)[][][]>([]);

  const ensureAxleRef = (axleIndex: number) => {
    if (!refsByAxle.current[axleIndex]) refsByAxle.current[axleIndex] = [];
    return refsByAxle.current[axleIndex];
  };

  const ensureRowRef = (axleIndex: number, rowIndex: number) => {
    const axleRef = ensureAxleRef(axleIndex);
    if (!axleRef[rowIndex]) axleRef[rowIndex] = [];
    return axleRef[rowIndex];
  };

  const focusNext = (
    e: KeyboardEvent<HTMLInputElement>,
    axleIndex: number,
    startRow: number,
    startCol: number,
    dir: 1 | -1,
  ) => {
    const axleRef = refsByAxle.current[axleIndex] || [];
    const rowCount = axleRef.length;
    if (rowCount === 0) return;

    const colCount = 2;
    const total = rowCount * colCount;
    const flat = startRow * colCount + startCol;

    for (let step = 1; step <= total; step++) {
      const nextFlat = (flat + dir * step + total) % total;
      const r = Math.floor(nextFlat / colCount);
      const c = nextFlat % colCount;

      const el = axleRef[r]?.[c] ?? null;
      if (el) {
        e.preventDefault();
        el.focus();
        el.select?.();
        return;
      }
    }
  };

  const InputWithInlineUnit = ({
    axleIndex,
    rowIndex,
    colIndex,
    cell,
  }: {
    axleIndex: number;
    rowIndex: number;
    colIndex: 0 | 1;
    cell: MetricCell;
  }) => {
    const spanRef = useRef<HTMLSpanElement | null>(null);

    const seedText = () => {
      // Pressure gets psi + kPa hint (optional), tread stays unit-only.
      if (!cell.isPressure) return cell.unit || "";
      const k = kpaFromPsi(cell.initial);
      if (!showKpa) return "psi";
      return k != null ? `psi (${k} kPa)` : "psi (— kPa)";
    };

    const onInput = (e: React.FormEvent<HTMLInputElement>) => {
      if (!cell.isPressure || !spanRef.current) return;
      const k = kpaFromPsi(e.currentTarget.value);
      if (!showKpa) {
        spanRef.current.textContent = "psi";
      } else if (k != null) {
        spanRef.current.textContent = `psi (${k} kPa)`;
      } else {
        spanRef.current.textContent = "psi (— kPa)";
      }
    };

    return (
      <div className="relative w-full">
        <input
          ref={(el) => {
            const rowRef = ensureRowRef(axleIndex, rowIndex);
            rowRef[colIndex] = el;
          }}
          defaultValue={cell.initial}
          className="w-full rounded-lg border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 px-3 py-1.5 pr-20 text-sm text-white placeholder:text-neutral-500 shadow-[0_10px_25px_rgba(0,0,0,0.75)] focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/70"
          placeholder="Value"
          autoComplete="off"
          inputMode="decimal"
          onInput={onInput}
          onKeyDown={(e) => {
            if (!open) return;
            if (e.key === "Tab") {
              focusNext(e, axleIndex, rowIndex, colIndex, e.shiftKey ? -1 : 1);
            }
          }}
          onBlur={(e) => commit(cell.idx, e.currentTarget)}
        />
        <span
          ref={spanRef}
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 whitespace-nowrap text-[11px] text-neutral-400"
        >
          {seedText()}
        </span>
      </div>
    );
  };

  const AxleCard = ({ g, axleIndex }: { g: AxleGroup; axleIndex: number }) => {
    const rows = buildTriplets(g);
    const filled = count(g.left) + count(g.right);
    const total = g.left.length + g.right.length;

    return (
      <div className="w-full overflow-hidden rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/55 shadow-[0_18px_45px_rgba(0,0,0,0.9)] backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div
            className="text-base font-semibold uppercase tracking-[0.18em] text-[color:var(--accent-copper,#f97316)]"
            style={{ fontFamily: "var(--font-blackops), system-ui, sans-serif" }}
          >
            {g.axle}
          </div>

          <div className="flex items-center gap-3">
            <span
              className="text-[11px] uppercase tracking-[0.16em] text-neutral-500"
              style={{ fontFamily: "Roboto, system-ui, sans-serif" }}
            >
              {filled}/{total}
            </span>

            <label className="flex select-none items-center gap-2 text-xs text-neutral-300">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-neutral-700 bg-neutral-900 accent-orange-500"
                checked={showKpa}
                onChange={(e) => setShowKpa(e.target.checked)}
                tabIndex={-1}
              />
              kPa hint
            </label>
          </div>
        </div>

        <div className="border-t border-white/10" />

        <div className="px-4 py-2">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 text-[11px] uppercase tracking-[0.16em] text-neutral-500">
            <div>Left</div>
            <div className="text-center">Item</div>
            <div className="text-right">Right</div>
          </div>
        </div>

        {open && (
          <div className="divide-y divide-white/10">
            {rows.map((row, rowIndex) => {
              // Ensure null slots exist so focus cycling skips missing cells properly
              const rowRef = ensureRowRef(axleIndex, rowIndex);
              if (rowRef[0] === undefined) rowRef[0] = null;
              if (rowRef[1] === undefined) rowRef[1] = null;

              return (
                <div
                  key={`${row.metric}-${rowIndex}`}
                  className="px-4 py-3 transition-colors hover:bg-white/[0.03]"
                >
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
                    <div>
                      {row.left ? (
                        <InputWithInlineUnit
                          axleIndex={axleIndex}
                          rowIndex={rowIndex}
                          colIndex={0}
                          cell={row.left}
                        />
                      ) : (
                        <div className="h-[34px]" />
                      )}
                    </div>

                    <div className="flex min-w-0 items-center justify-center gap-2">
                      <span
                        className="truncate text-center text-sm font-semibold text-neutral-100"
                        style={{
                          fontFamily:
                            "var(--font-blackops), system-ui, sans-serif",
                        }}
                        title={row.metric}
                      >
                        {row.metric}
                      </span>
                      {onSpecHint && (
                        <button
                          type="button"
                          tabIndex={-1}
                          onClick={() => onSpecHint(row.metric)}
                          className="rounded-full border border-orange-500/60 bg-orange-500/10 px-2 py-[2px] text-[9px] font-semibold uppercase tracking-[0.16em] text-orange-300 hover:bg-orange-500/20"
                          title="Show CVIP spec"
                        >
                          Spec
                        </button>
                      )}
                    </div>

                    <div className="justify-self-end">
                      {row.right ? (
                        <InputWithInlineUnit
                          axleIndex={axleIndex}
                          rowIndex={rowIndex}
                          colIndex={1}
                          cell={row.right}
                        />
                      ) : (
                        <div className="h-[34px]" />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="grid w-full gap-3">
      <div className="flex items-center justify-end gap-3 px-1">
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded-full border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-neutral-100 shadow-[0_10px_24px_rgba(0,0,0,0.85)] hover:border-orange-500 hover:bg-black/80"
          tabIndex={-1}
          type="button"
          aria-expanded={open}
          title={open ? "Collapse" : "Expand"}
        >
          {open ? "Collapse" : "Expand"}
        </button>
      </div>

      {onAddAxle && <AddAxlePicker groups={groups} onAddAxle={onAddAxle} />}

      <div className="grid w-full gap-4">
        {groups.map((g, axleIndex) => (
          <AxleCard key={g.axle} g={g} axleIndex={axleIndex} />
        ))}
      </div>
    </div>
  );
}

/** Inline axle picker with glassy styling */
function AddAxlePicker({
  groups,
  onAddAxle,
}: {
  groups: { axle: string }[];
  onAddAxle: (axleLabel: string) => void;
}) {
  const existing = useMemo(() => groups.map((g) => g.axle), [groups]);
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
        className="rounded-full border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 px-3 py-1 text-xs text-neutral-100 shadow-[0_10px_24px_rgba(0,0,0,0.85)] focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/80"
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
        className="rounded-full bg-[linear-gradient(to_right,var(--accent-copper-soft,#e17a3e),var(--accent-copper,#f97316))] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-black shadow-[0_0_18px_rgba(212,118,49,0.6)] hover:brightness-110 disabled:opacity-40"
        onClick={() => pending && onAddAxle(pending)}
        disabled={!pending}
        type="button"
      >
        + Add
      </button>
    </div>
  );
}