// features/inspections/lib/inspection/ui/TireCornerGrid.tsx
"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
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

// "<Axle> Left <Metric>" or "<Axle> Right <Metric>"
const labelRe = /^(?<axle>.+?)\s+(?<side>Left|Right)\s+(?<metric>.+)$/i;

const isTireMetric = (metric: string) => {
  const m = metric.toLowerCase();
  return m.includes("tire") || m.includes("tread") || m.includes("pressure");
};

const isWheelTorqueMetric = (metric: string) => /wheel\s*torque/i.test(metric);

const tirePriority = (metric: string): [number, number] => {
  const m = metric.toLowerCase();

  if (/tire\s*pressure/i.test(m)) {
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

const axleIndexSort = (axle: string): number => {
  const a = axle.toLowerCase();

  // Put steer before drive before tag before trailer, etc.
  const tier =
    a.startsWith("steer") ? 0 : a.startsWith("drive") ? 1 : a.startsWith("tag") ? 2 : a.startsWith("trailer") ? 3 : 9;

  const numMatch = axle.match(/(\d+)/);
  const num = numMatch?.[1] ? Number(numMatch[1]) : Number.NaN;

  return tier * 1000 + (Number.isFinite(num) ? num : 999);
};

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

  const commit = (idx: number, value: string) => {
    updateItem(sectionIndex, idx, { value });
  };

  const groups: AxleGroup[] = useMemo(() => {
    const byAxle = new Map<
      string,
      { Left: MetricCell[]; Right: MetricCell[] }
    >();

    items.forEach((it, idx) => {
      const label = it.item ?? "";
      const m = label.match(labelRe);
      if (!m?.groups) return;

      const axle = m.groups.axle.trim();
      const side = (m.groups.side as Side) || "Left";
      const metric = m.groups.metric.trim();

      // ✅ Tire grid only: keep only tire metrics
      if (!isTireMetric(metric)) return;

      // ✅ Never show wheel torque in tire grid
      if (isWheelTorqueMetric(metric)) return;

      if (!byAxle.has(axle)) byAxle.set(axle, { Left: [], Right: [] });

      const unit =
        (it.unit ?? "").trim() || (unitHint ? unitHint(label).trim() : "");

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

    const built = Array.from(byAxle.entries()).map(([axle, sides]) => {
      const left = expandDuals(axle, sides.Left).sort((a, b) =>
        orderCompare(a.metric, b.metric),
      );
      const right = expandDuals(axle, sides.Right).sort((a, b) =>
        orderCompare(a.metric, b.metric),
      );
      return { axle, left, right };
    });

    // Keep axle cards stable/predictable
    return built.sort((a, b) => axleIndexSort(a.axle) - axleIndexSort(b.axle));
  }, [items, unitHint]);

  const kpaFromPsi = (psiStr: string) => {
    const n = Number(psiStr);
    return Number.isFinite(n) ? Math.round(n * 6.894757) : null;
  };

  /**
   * ✅ Make TAB work naturally by using a real table layout (like BatteryGrid)
   * and keeping inputs in a predictable DOM order.
   *
   * We do NOT trap Tab (because Safari/Chrome can skip custom focus traps inside
   * overflowed/positioned containers). A native table layout fixes the issue
   * you’re seeing where Tab jumps out of the container.
   */

  const unitSpanRefs = useRef<Record<number, HTMLSpanElement | null>>({});

  const seedUnitText = (cell: MetricCell) => {
    if (!cell.isPressure) return cell.unit || "";
    const k = kpaFromPsi(cell.initial);
    if (!showKpa) return "psi";
    return k != null ? `psi (${k} kPa)` : "psi (— kPa)";
  };

  const onPressureInput = (idx: number) => (e: FormEvent<HTMLInputElement>) => {
    const span = unitSpanRefs.current[idx] ?? null;
    if (!span) return;

    const k = kpaFromPsi(e.currentTarget.value);
    if (!showKpa) {
      span.textContent = "psi";
    } else if (k != null) {
      span.textContent = `psi (${k} kPa)`;
    } else {
      span.textContent = "psi (— kPa)";
    }
  };

  const AxleCard = ({ g }: { g: AxleGroup }) => {
    const rows = buildTriplets(g);

    // If the axle has no tire metrics, don't render empty card
    if (!rows.length) return null;

    const total = g.left.length + g.right.length;

    return (
      <div className="w-full overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-950/70 shadow-[0_18px_45px_rgba(0,0,0,0.85)] backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div
            className="text-base font-semibold uppercase tracking-[0.18em] text-[color:var(--accent-copper,#f97316)]"
            style={{
              fontFamily: "var(--font-blackops), system-ui, sans-serif",
            }}
          >
            {g.axle}
          </div>

          <div className="flex items-center gap-3">
            <span
              className="text-[11px] uppercase tracking-[0.16em] text-neutral-500"
              style={{ fontFamily: "Roboto, system-ui, sans-serif" }}
            >
              0/{total}
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

        {open && (
          <div className="overflow-x-auto">
            <div className="inline-block min-w-full align-middle">
              <table className="min-w-full border-separate border-spacing-y-[2px]">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th className="px-4 py-1.5 text-left text-[11px] font-normal uppercase tracking-[0.16em] text-slate-400">
                      Item
                    </th>
                    <th className="px-4 py-1.5 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-100">
                      Left
                    </th>
                    <th className="px-4 py-1.5 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-100">
                      Right
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {rows.map((row, rowIndex) => (
                    <tr
                      key={`${row.metric}-${rowIndex}`}
                      className="align-middle hover:bg-white/[0.03]"
                    >
                      <td className="px-4 py-1.5 text-sm font-semibold text-foreground">
                        <div className="flex items-center gap-2">
                          <span className="leading-tight">{row.metric}</span>
                          {onSpecHint && (
                            <button
                              type="button"
                              tabIndex={-1}
                              onClick={() => onSpecHint(row.metric)}
                              className="rounded-full border border-orange-500/50 bg-orange-500/10 px-2 py-[2px] text-[9px] font-semibold uppercase tracking-[0.16em] text-orange-300 hover:bg-orange-500/20"
                              title="Show CVIP spec"
                            >
                              Spec
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Left input */}
                      <td className="px-4 py-1.5 text-center">
                        {row.left ? (
                          <div className="relative w-full max-w-[8.5rem]">
                            <input
                              defaultValue={row.left.initial}
                              className="w-full rounded-lg border border-slate-700/70 bg-slate-950/70 px-3 py-1.5 pr-16 text-sm text-foreground placeholder:text-slate-500 focus:border-orange-400 focus:ring-2 focus:ring-orange-400"
                              placeholder="Value"
                              autoComplete="off"
                              inputMode="decimal"
                              onInput={
                                row.left.isPressure
                                  ? onPressureInput(row.left.idx)
                                  : undefined
                              }
                              onBlur={(e) =>
                                commit(row.left!.idx, e.currentTarget.value)
                              }
                            />
                            <span
                              ref={(el) => {
                                unitSpanRefs.current[row.left!.idx] = el;
                              }}
                              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 whitespace-nowrap text-[11px] text-muted-foreground"
                            >
                              {seedUnitText(row.left)}
                            </span>
                          </div>
                        ) : (
                          <div className="h-[32px]" />
                        )}
                      </td>

                      {/* Right input */}
                      <td className="px-4 py-1.5 text-center">
                        {row.right ? (
                          <div className="relative w-full max-w-[8.5rem]">
                            <input
                              defaultValue={row.right.initial}
                              className="w-full rounded-lg border border-slate-700/70 bg-slate-950/70 px-3 py-1.5 pr-16 text-sm text-foreground placeholder:text-slate-500 focus:border-orange-400 focus:ring-2 focus:ring-orange-400"
                              placeholder="Value"
                              autoComplete="off"
                              inputMode="decimal"
                              onInput={
                                row.right.isPressure
                                  ? onPressureInput(row.right.idx)
                                  : undefined
                              }
                              onBlur={(e) =>
                                commit(row.right!.idx, e.currentTarget.value)
                              }
                            />
                            <span
                              ref={(el) => {
                                unitSpanRefs.current[row.right!.idx] = el;
                              }}
                              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 whitespace-nowrap text-[11px] text-muted-foreground"
                            >
                              {seedUnitText(row.right)}
                            </span>
                          </div>
                        ) : (
                          <div className="h-[32px]" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  // If nothing matched tires-only, let parent decide fallback
  if (!groups.length || groups.every((g) => !buildTriplets(g).length)) {
    return null;
  }

  return (
    <div className="grid w-full gap-3">
      <div className="flex items-center justify-end gap-3 px-1">
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded-md border border-slate-600/50 bg-slate-900/40 px-2 py-1 text-xs text-slate-100 hover:border-orange-400/70 hover:bg-slate-900/70"
          tabIndex={-1}
          type="button"
          aria-expanded={open}
          title={open ? "Collapse" : "Expand"}
        >
          {open ? "Collapse" : "Expand"}
        </button>
      </div>

      {onAddAxle ? <AddAxlePicker groups={groups} onAddAxle={onAddAxle} /> : null}

      <div className="grid w-full gap-4">
        {groups.map((g) => (
          <AxleCard key={g.axle} g={g} />
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
        onClick={() => (pending ? onAddAxle(pending) : null)}
        disabled={!pending}
        type="button"
      >
        + Add
      </button>
    </div>
  );
}