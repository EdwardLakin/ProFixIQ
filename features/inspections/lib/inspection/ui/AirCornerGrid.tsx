// features/inspections/lib/inspection/ui/AirCornerGrid.tsx
"use client";

import { useMemo, useState } from "react";
import { useInspectionForm } from "@inspections/lib/inspection/ui/InspectionFormContext";
import type { InspectionItem } from "@inspections/lib/inspection/types";

type Props = {
  sectionIndex: number;
  items: InspectionItem[];
  unitHint?: (label: string) => string;
  onAddAxle?: (axleLabel: string) => void;
  /** Optional: show CVIP spec for a given metric label (e.g. "Brake Pad"). */
  onSpecHint?: (metricLabel: string) => void;
};

type Side = "Left" | "Right";

type MetricCell = {
  metric: string;
  idx: number;
  unit: string;
  fullLabel: string;
  initial: string;
};

type AxleGroup = { axle: string; left: MetricCell[]; right: MetricCell[] };

type RowTriplet = { metric: string; left?: MetricCell; right?: MetricCell };

const labelRe = /^(?<axle>.+?)\s+(?<side>Left|Right)\s+(?<metric>.+)$/i;

// ✅ HARD FILTER: brakes-only. Never render tire rows here.
const isTireMetric = (metric: string) => {
  const m = metric.toLowerCase();
  return m.includes("tire") || m.includes("tread") || m.includes("pressure");
};

const airPriority = (metric: string): [number, number] => {
  const m = metric.toLowerCase();

  if (/(lining|shoe|pad)/i.test(m)) return [0, 0];
  if (/(drum|rotor)/i.test(m)) return [1, 0];
  if (/push\s*rod/i.test(m)) return [2, 0];
  if (/wheel\s*torque/i.test(m)) return [3, /inner/i.test(m) ? 1 : 0];

  return [99, 0];
};

const orderCompare = (a: string, b: string) => {
  const [pa, sa] = airPriority(a);
  const [pb, sb] = airPriority(b);
  return pa !== pb ? pa - pb : sa - sb;
};

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

export default function AirCornerGrid({
  sectionIndex,
  items,
  unitHint,
  onAddAxle,
  onSpecHint,
}: Props) {
  const { updateItem } = useInspectionForm();
  const [open, setOpen] = useState(true);

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

      // ✅ brakes-only (avoid the “tires + brakes” leak when adding an axle)
      if (isTireMetric(metric)) return;

      if (!byAxle.has(axle)) byAxle.set(axle, { Left: [], Right: [] });

      const unit =
        (it.unit ?? "").trim() || (unitHint ? unitHint(label).trim() : "");

      const cell: MetricCell = {
        metric,
        idx,
        unit,
        fullLabel: label,
        initial: String(it.value ?? ""),
      };

      byAxle.get(axle)![side].push(cell);
    });

    return Array.from(byAxle.entries()).map(([axle, sides]) => {
      const left = [...sides.Left].sort((a, b) =>
        orderCompare(a.metric, b.metric),
      );
      const right = [...sides.Right].sort((a, b) =>
        orderCompare(a.metric, b.metric),
      );
      return { axle, left, right };
    });
  }, [items, unitHint]);

  const AxleCard = ({ g }: { g: AxleGroup }) => {
    const rows = buildTriplets(g);

    // If an axle has no brake items, don't render an empty card.
    if (!rows.length) return null;

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
        </div>

        <div className="border-t border-white/10" />

        {/* Match the “table-first” pattern so native TAB behaves consistently */}
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
                  {rows.map((row, rowIndex) => {
                    const leftUnit = row.left?.unit ?? "";
                    const rightUnit = row.right?.unit ?? "";

                    return (
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

                        <td className="px-4 py-1.5 text-center">
                          {row.left ? (
                            <div className="relative w-full max-w-[8.5rem]">
                              <input
                                defaultValue={row.left.initial}
                                className="w-full rounded-lg border border-slate-700/70 bg-slate-950/70 px-3 py-1.5 pr-14 text-sm text-foreground placeholder:text-slate-500 focus:border-orange-400 focus:ring-2 focus:ring-orange-400"
                                placeholder="Value"
                                autoComplete="off"
                                inputMode="decimal"
                                onBlur={(e) =>
                                  commit(row.left!.idx, e.currentTarget.value)
                                }
                              />
                              {leftUnit ? (
                                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 whitespace-nowrap text-[11px] text-muted-foreground">
                                  {leftUnit}
                                </span>
                              ) : null}
                            </div>
                          ) : (
                            <div className="h-[32px]" />
                          )}
                        </td>

                        <td className="px-4 py-1.5 text-center">
                          {row.right ? (
                            <div className="relative w-full max-w-[8.5rem]">
                              <input
                                defaultValue={row.right.initial}
                                className="w-full rounded-lg border border-slate-700/70 bg-slate-950/70 px-3 py-1.5 pr-14 text-sm text-foreground placeholder:text-slate-500 focus:border-orange-400 focus:ring-2 focus:ring-orange-400"
                                placeholder="Value"
                                autoComplete="off"
                                inputMode="decimal"
                                onBlur={(e) =>
                                  commit(row.right!.idx, e.currentTarget.value)
                                }
                              />
                              {rightUnit ? (
                                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 whitespace-nowrap text-[11px] text-muted-foreground">
                                  {rightUnit}
                                </span>
                              ) : null}
                            </div>
                          ) : (
                            <div className="h-[32px]" />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  // If nothing matched brakes-only, let parent decide fallback
  if (!groups.length || groups.every((g) => !buildTriplets(g).length)) {
    return null;
  }

  return (
    <div className="grid w-full gap-3">
      <div className="flex items-center justify-end gap-3 px-1">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-md border border-slate-600/50 bg-slate-900/40 px-2 py-1 text-xs text-slate-100 hover:border-orange-400/70 hover:bg-slate-900/70"
          aria-expanded={open}
          title={open ? "Collapse" : "Expand"}
          tabIndex={-1}
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