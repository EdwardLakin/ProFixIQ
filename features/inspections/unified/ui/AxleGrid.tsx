"use client";

import { useMemo, useRef, useState } from "react";
import type { InspectionItem } from "@inspections/lib/inspection/types";

type GridUnitMode = "metric" | "imperial";

type AxleGridProps = {
  title?: string;
  sectionIndex: number;
  items: InspectionItem[];
  unitMode: GridUnitMode;
  showKpaHint: boolean;
  onUpdateItem: (
    sectionIndex: number,
    itemIndex: number,
    patch: Partial<InspectionItem>,
  ) => void;
  onAddAxle?: (axleLabel: string) => void;
};

type Side = "Left" | "Right";
const labelRe =
  /^(?<axle>.+?)\s+(?<side>Left|Right)\s+(?<metric>.+)$/i;

type MetricCell = {
  metric: string;
  idx: number;
  unit: string;
  fullLabel: string;
  isPressure: boolean;
  initial: string;
};

type AxleGroup = {
  axle: string;
  left: MetricCell[];
  right: MetricCell[];
};

/* -------------------------------------------------------------------------- */
/* Metric ordering + helpers (from old AirCornerGrid)                         */
/* -------------------------------------------------------------------------- */

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
  if (a.startsWith("drive") || a.startsWith("trailer") || a.includes("rear")) {
    return true;
  }
  if (a.startsWith("tag") || a.startsWith("steer")) return false;
  return false;
};

const isDualizableMetric = (metric: string) =>
  /tire\s*pressure/i.test(metric) ||
  /(tire\s*)?tread\s*depth|tire\s*tread/i.test(metric);

const hasInnerOuter = (metric: string) => /(inner|outer)/i.test(metric);

/**
 * Expand single measurements on dual axles into Inner/Outer pairs.
 */
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

/**
 * Fallback unit logic when item.unit is empty.
 */
function getUnitFromMetric(
  metric: string,
  explicitUnit: string | null | undefined,
  unitMode: GridUnitMode,
): string {
  if (explicitUnit && explicitUnit.trim()) return explicitUnit.trim();

  const m = metric.toLowerCase();

  if (/pressure/i.test(m)) return "psi";

  if (
    /(tire\s*)?tread\s*depth|tire\s*tread/i.test(m) ||
    /(lining|shoe|pad)/i.test(m) ||
    /(drum|rotor)/i.test(m) ||
    /thickness/i.test(m) ||
    /push\s*rod/i.test(m)
  ) {
    return unitMode === "metric" ? "mm" : "in";
  }

  return unitMode === "metric" ? "mm" : "in";
}

/* -------------------------------------------------------------------------- */
/* AxleGrid                                                                   */
/* -------------------------------------------------------------------------- */

const AxleGrid: React.FC<AxleGridProps> = ({
  title,
  sectionIndex,
  items,
  unitMode,
  showKpaHint,
  onUpdateItem,
  onAddAxle,
}) => {
  /* --------------------------- group items by axle -------------------------- */

  const groups: AxleGroup[] = useMemo(() => {
    const byAxle = new Map<string, { Left: MetricCell[]; Right: MetricCell[] }>();

    items.forEach((it, idx) => {
      const label = it.item ?? "";
      const m = label.match(labelRe);
      if (!m?.groups) return;

      const axle = m.groups.axle.trim();
      const side = (m.groups.side as Side) || "Left";
      const metric = m.groups.metric.trim();

      if (!byAxle.has(axle)) {
        byAxle.set(axle, { Left: [], Right: [] });
      }

      const unit = getUnitFromMetric(metric, it.unit, unitMode);
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
  }, [items, unitMode]);

  /* ------------------------- state for open / filled ------------------------ */

  const [open, setOpen] = useState(true);
  const [showKpa, setShowKpa] = useState(showKpaHint);

  const [filledMap, setFilledMap] = useState<Record<number, boolean>>(() => {
    const m: Record<number, boolean> = {};
    items.forEach((it, i) => (m[i] = !!String(it.value ?? "").trim()));
    return m;
  });

  const countFilled = (cells: MetricCell[]) =>
    cells.reduce((a, r) => a + (filledMap[r.idx] ? 1 : 0), 0);

  /* ----------------------------- commit handler ----------------------------- */

  const kpaFromPsi = (psiStr: string) => {
    const n = Number(psiStr);
    return Number.isFinite(n) ? Math.round(n * 6.894757) : null;
  };

  const commit = (idx: number, el: HTMLInputElement | null) => {
    if (!el) return;
    const value = el.value;
    onUpdateItem(sectionIndex, idx, { value });
    const has = value.trim().length > 0;
    setFilledMap((p) => (p[idx] === has ? p : { ...p, [idx]: has }));
  };

  /* ----------------------------- input component ---------------------------- */

  const InputWithInlineUnit = ({
    idx,
    isPressure,
    unit,
    defaultValue,
    showHint,
  }: {
    idx: number;
    isPressure: boolean;
    unit: string;
    defaultValue: string;
    showHint: boolean;
  }) => {
    const spanRef = useRef<HTMLSpanElement | null>(null);

    const kSeed = () => {
      if (!isPressure) return unit;
      const k = kpaFromPsi(defaultValue);
      if (!showHint) return "psi";
      return k != null ? `psi (${k} kPa)` : "psi (— kPa)";
    };

    const onInput = (e: React.FormEvent<HTMLInputElement>) => {
      if (!isPressure || !spanRef.current) return;
      const k = kpaFromPsi(e.currentTarget.value);
      if (!showHint) {
        spanRef.current.textContent = "psi";
      } else if (k != null) {
        spanRef.current.textContent = `psi (${k} kPa)`;
      } else {
        spanRef.current.textContent = "psi (— kPa)";
      }
    };

    return (
      <div className="relative w-full max-w-[11rem]">
        <input
          name={`air-${idx}`}
          defaultValue={defaultValue}
          tabIndex={0}
          className="w-full rounded-lg border border-[color:var(--metal-border-soft,#1f2937)] bg-black/75 px-3 py-1.5 pr-24 text-sm text-white placeholder:text-neutral-500 focus:border-[color:var(--accent-copper,#ea580c)] focus:ring-2 focus:ring-[color:var(--accent-copper-soft,#fdba74)]"
          placeholder="Value"
          autoComplete="off"
          inputMode="decimal"
          onInput={onInput}
          onBlur={(e) => commit(idx, e.currentTarget)}
          onKeyDown={(e) =>
            e.key === "Enter" &&
            (e.currentTarget as HTMLInputElement).blur()
          }
        />
        <span
          ref={spanRef}
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 whitespace-nowrap text-[11px] text-neutral-400"
        >
          {kSeed()}
        </span>
      </div>
    );
  };

  /* ------------------------- rows per axle (triplets) ---------------------- */

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

  const AxleCard = ({ g }: { g: AxleGroup }) => {
    const rows = buildTriplets(g);

    return (
      <div className="rounded-2xl border border-white/10 bg-black/50 p-4 shadow-[0_22px_60px_rgba(0,0,0,0.95)] backdrop-blur-md">
        <div className="mb-3 text-lg font-blackops tracking-[0.18em] text-[color:var(--accent-copper-light,#fed7aa)]">
          {g.axle}
        </div>

        <div className="mb-2 grid grid-cols-[1fr_auto_1fr] items-center gap-4 text-xs text-neutral-400">
          <div>Left</div>
          <div className="text-center">Item</div>
          <div className="text-right">Right</div>
        </div>

        {open && (
          <div className="space-y-3">
            {rows.map((row, i) => {
              const leftUnit = getUnitFromMetric(
                row.metric,
                row.left?.unit,
                unitMode,
              );
              const rightUnit = getUnitFromMetric(
                row.metric,
                row.right?.unit,
                unitMode,
              );

              return (
                <div
                  key={`${row.metric}-${i}`}
                  className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 rounded-xl bg-black/70 p-3"
                >
                  <div>
                    {row.left ? (
                      <InputWithInlineUnit
                        idx={row.left.idx}
                        isPressure={row.left.isPressure}
                        unit={leftUnit}
                        defaultValue={row.left.initial}
                        showHint={showKpa}
                      />
                    ) : (
                      <div className="h-[34px]" />
                    )}
                  </div>

                  <div
                    className="min-w-0 truncate text-center text-sm font-semibold text-neutral-50"
                    style={{
                      fontFamily:
                        "Black Ops One, system-ui, system, -apple-system, sans-serif",
                    }}
                    title={row.metric}
                  >
                    {row.metric}
                  </div>

                  <div className="justify-self-end">
                    {row.right ? (
                      <InputWithInlineUnit
                        idx={row.right.idx}
                        isPressure={row.right.isPressure}
                        unit={rightUnit}
                        defaultValue={row.right.initial}
                        showHint={showKpa}
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

  if (groups.length === 0) return null;

  return (
    <div className="grid gap-4">
      {/* Header row: title, status, toggles */}
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="flex flex-col gap-1">
          <div className="text-[11px] font-blackops uppercase tracking-[0.22em] text-neutral-400">
            {title ?? "Axle Measurements · Air Brake"}
          </div>
          <div
            className="hidden text-xs text-neutral-400 md:block"
            style={{ fontFamily: "Roboto, system-ui, sans-serif" }}
          >
            {groups.map((g, i) => {
              const filled =
                countFilled(g.left) + countFilled(g.right);
              const total = g.left.length + g.right.length;
              return (
                <span key={g.axle}>
                  {g.axle} {filled}/{total}
                  {i < groups.length - 1 ? "  |  " : ""}
                </span>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex select-none items-center gap-2 text-xs text-neutral-300">
            <input
              type="checkbox"
              className="h-3 w-3 accent-orange-500"
              checked={showKpa}
              onChange={(e) => setShowKpa(e.target.checked)}
              tabIndex={-1}
            />
            kPa hint
          </label>

          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white hover:border-[color:var(--accent-copper,#ea580c)] hover:bg-white/10"
            tabIndex={-1}
            aria-expanded={open}
          >
            {open ? "Collapse" : "Expand"}
          </button>
        </div>
      </div>

      {/* Inline axle picker (Add axle…) */}
      {onAddAxle && <AddAxlePicker groups={groups} onAddAxle={onAddAxle} />}

      {/* Axle cards */}
      {groups.map((g) => (
        <AxleCard key={g.axle} g={g} />
      ))}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Inline Add Axle picker (same as old AirCornerGrid, reskinned)              */
/* -------------------------------------------------------------------------- */

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
        className="rounded-lg border border-[color:var(--metal-border-soft,#1f2937)] bg-black/75 px-2 py-1 text-sm text-white"
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
        className="rounded-lg bg-[color:var(--accent-copper,#ea580c)] px-3 py-1 text-sm font-semibold text-black shadow-[0_0_20px_rgba(234,88,12,0.75)] hover:bg-[color:var(--accent-copper-soft,#fdba74)] disabled:opacity-40"
        onClick={() => pending && onAddAxle(pending)}
        disabled={!pending}
      >
        + Add
      </button>
    </div>
  );
}

export default AxleGrid;