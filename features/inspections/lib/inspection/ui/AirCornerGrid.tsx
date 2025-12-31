// features/inspections/lib/inspection/ui/AirCornerGrid.tsx
"use client";

import { useMemo, useRef, useState } from "react";
import { useInspectionForm } from "@inspections/lib/inspection/ui/InspectionFormContext";
import type { InspectionItem } from "@inspections/lib/inspection/types";

type Props = {
  sectionIndex: number;
  items: InspectionItem[];
  unitHint?: (label: string) => string;
  onAddAxle?: (axleLabel: string) => void;
  /** Optional: show CVIP spec for a given metric label (e.g. "Tire Pressure"). */
  onSpecHint?: (metricLabel: string) => void;
};

export default function AirCornerGrid({
  sectionIndex,
  items,
  unitHint,
  onAddAxle,
  onSpecHint,
}: Props) {
  const { updateItem } = useInspectionForm();

  type Side = "Left" | "Right";
  const labelRe = /^(?<axle>.+?)\s+(?<side>Left|Right)\s+(?<metric>.+)$/i;

  type MetricCell = {
    metric: string;
    idx: number;
    unit: string;
    fullLabel: string;
    isPressure: boolean;
    initial: string;
  };
  type AxleGroup = { axle: string; left: MetricCell[]; right: MetricCell[] };

  const airPriority = (metric: string): [number, number] => {
    const m = metric.toLowerCase();
    if (/tire\s*pressure/i.test(m)) {
      const second = /outer/i.test(m) ? 0 : /inner/i.test(m) ? 1 : 0;
      return [0, second];
    }
    if (/(tire\s*)?tread\s*depth|tire\s*tread/i.test(m)) {
      const second = /outer/i.test(m) ? 0 : /inner/i.test(m) ? 1 : 0;
      return [1, second];
    }
    if (/(lining|shoe|pad)/i.test(m)) return [2, 0];
    if (/(drum|rotor)/i.test(m)) return [3, 0];
    if (/push\s*rod/i.test(m)) return [4, 0];
    if (/wheel\s*torque/i.test(m)) return [5, /inner/i.test(m) ? 1 : 0];
    return [99, 0];
  };

  const orderCompare = (a: string, b: string) => {
    const [pa, sa] = airPriority(a);
    const [pb, sb] = airPriority(b);
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
        isPressure: /pressure/i.test(metric),
        initial: String(it.value ?? ""),
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

  const [open, setOpen] = useState(true);
  const [showKpa, setShowKpa] = useState(true);

  const [filledMap, setFilledMap] = useState<Record<number, boolean>>(() => {
    const m: Record<number, boolean> = {};
    items.forEach((it, i) => (m[i] = !!String(it.value ?? "").trim()));
    return m;
  });

  const count = (cells: MetricCell[]) =>
    cells.reduce((a, r) => a + (filledMap[r.idx] ? 1 : 0), 0);

  const commit = (idx: number, el: HTMLInputElement | null) => {
    if (!el) return;
    const value = el.value;
    updateItem(sectionIndex, idx, { value });
    const has = value.trim().length > 0;
    setFilledMap((p) => (p[idx] === has ? p : { ...p, [idx]: has }));
  };

  const kpaFromPsi = (psiStr: string) => {
    const n = Number(psiStr);
    return Number.isFinite(n) ? Math.round(n * 6.894757) : null;
  };

  type RowTriplet = { metric: string; left?: MetricCell; right?: MetricCell };

  const buildTriplets = (g: AxleGroup): RowTriplet[] => {
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
  };

  const InputWithInlineUnit = ({
    idx,
    isPressure,
    unit,
    defaultValue,
    showKpaHint,
  }: {
    idx: number;
    isPressure: boolean;
    unit: string;
    defaultValue: string;
    showKpaHint: boolean;
  }) => {
    const spanRef = useRef<HTMLSpanElement | null>(null);

    const seedText = () => {
      if (!isPressure) return unit || "";
      const k = kpaFromPsi(defaultValue);
      if (!showKpaHint) return "psi";
      return k != null ? `psi (${k} kPa)` : "psi (— kPa)";
    };

    const onInput = (e: React.FormEvent<HTMLInputElement>) => {
      if (!isPressure || !spanRef.current) return;
      const k = kpaFromPsi(e.currentTarget.value);
      if (!showKpaHint) {
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
          name={`air-${idx}`}
          defaultValue={defaultValue}
          className="w-full rounded-xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/80 px-3 py-1.5 pr-20 text-sm text-white placeholder:text-neutral-500 shadow-[0_10px_25px_rgba(0,0,0,0.85)] focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/80"
          placeholder="Value"
          autoComplete="off"
          inputMode="decimal"
          onInput={onInput}
          onBlur={(e) => commit(idx, e.currentTarget)}
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

  const AxleCard = ({ g }: { g: AxleGroup }) => {
    const rows = buildTriplets(g);
    return (
      <div className="w-full rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/55 p-4 shadow-[0_18px_45px_rgba(0,0,0,0.9)] backdrop-blur-xl">
        <div
          className="mb-3 text-lg font-semibold uppercase tracking-[0.18em] text-[color:var(--accent-copper,#f97316)]"
          style={{ fontFamily: "var(--font-blackops), system-ui, sans-serif" }}
        >
          {g.axle}
        </div>

        <div className="mb-2 grid grid-cols-[1fr_auto_1fr] items-center gap-4 text-[11px] uppercase tracking-[0.16em] text-neutral-500">
          <div>Left</div>
          <div className="text-center">Item</div>
          <div className="text-right">Right</div>
        </div>

        {open && (
          <div className="space-y-3">
            {rows.map((row, i) => {
              const leftUnit =
                row.left?.unit ??
                (unitHint ? unitHint(row.left?.fullLabel ?? "") : "") ??
                "";
              const rightUnit =
                row.right?.unit ??
                (unitHint ? unitHint(row.right?.fullLabel ?? "") : "") ??
                "";
              return (
                <div
                  key={`${row.metric}-${i}`}
                  className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 rounded-xl border border-slate-800/80 bg-neutral-950/80 p-3 shadow-[0_14px_35px_rgba(0,0,0,0.9)]"
                >
                  <div>
                    {row.left ? (
                      <InputWithInlineUnit
                        idx={row.left.idx}
                        isPressure={row.left.isPressure}
                        unit={leftUnit}
                        defaultValue={row.left.initial}
                        showKpaHint={showKpa}
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
                        idx={row.right.idx}
                        isPressure={row.right.isPressure}
                        unit={rightUnit}
                        defaultValue={row.right.initial}
                        showKpaHint={showKpa}
                      />
                    ) : (
                      <div className="h-[34px]" />
                    )}
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
      <div className="flex items-center justify-between gap-3 px-1">
        <div
          className="hidden text-[11px] uppercase tracking-[0.14em] text-neutral-500 md:block"
          style={{ fontFamily: "Roboto, system-ui, sans-serif" }}
        >
          {groups.map((g, i) => {
            const filled = count(g.left) + count(g.right);
            const total = g.left.length + g.right.length;
            return (
              <span key={g.axle}>
                {g.axle} {filled}/{total}
                {i < groups.length - 1 ? "  |  " : ""}
              </span>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
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

          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded-full border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-neutral-100 shadow-[0_10px_24px_rgba(0,0,0,0.85)] hover:border-orange-500 hover:bg-black/80"
            tabIndex={-1}
          >
            {open ? "Collapse" : "Expand"}
          </button>
        </div>
      </div>

      {onAddAxle && <AddAxlePicker groups={groups} onAddAxle={onAddAxle} />}

      {/* full-width cards */}
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
        onClick={() => pending && onAddAxle(pending)}
        disabled={!pending}
      >
        + Add
      </button>
    </div>
  );
}