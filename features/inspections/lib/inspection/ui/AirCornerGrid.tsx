"use client";

import { useMemo, useRef, useState } from "react";
import { useInspectionForm } from "@inspections/lib/inspection/ui/InspectionFormContext";
import type { InspectionItem } from "@inspections/lib/inspection/types";

type Props = {
  sectionIndex: number;
  items: InspectionItem[];
  unitHint?: (label: string) => string;
  onAddAxle?: (axleLabel: string) => void;
};

export default function AirCornerGrid({ sectionIndex, items, unitHint, onAddAxle }: Props) {
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

  /* --------------------- strict ordering for AIR --------------------- */
  const airPriority = (metric: string): [number, number] => {
    const m = metric.toLowerCase();

    // 0: Tire Pressure (Outer before Inner)
    if (/tire\s*pressure/i.test(m)) {
      const second = /outer/i.test(m) ? 0 : /inner/i.test(m) ? 1 : 0;
      return [0, second];
    }

    // 1: Tread Depth (Outer before Inner) + "Tire Tread"
    if (/(tire\s*)?tread\s*depth|tire\s*tread/i.test(m)) {
      const second = /outer/i.test(m) ? 0 : /inner/i.test(m) ? 1 : 0;
      return [1, second];
    }

    // 2: Shoes/Pads (Lining/Shoe/Pad)
    if (/(lining|shoe|pad)/i.test(m)) return [2, 0];

    // 3: Drum/Rotor (Condition/Thickness)
    if (/(drum|rotor)/i.test(m)) return [3, 0];

    // 4: Push Rod Travel
    if (/push\s*rod/i.test(m)) return [4, 0];

    // 5: Wheel torque variants (Inner/Outer secondary key if present)
    if (/wheel\s*torque/i.test(m)) return [5, /inner/i.test(m) ? 1 : 0];

    return [99, 0];
  };
  const orderCompare = (a: string, b: string) => {
    const [pa, sa] = airPriority(a);
    const [pb, sb] = airPriority(b);
    return pa !== pb ? pa - pb : sa - sb;
  };

  /** Identify which axles are dual-tire axles. Tag axles = steer type (single tires). */
  const isDualAxle = (axleLabel: string) => {
    const a = axleLabel.toLowerCase();
    // Drive, Trailer, and Rear are duals; Tag and Steer are not.
    if (a.startsWith("drive") || a.startsWith("trailer") || a.includes("rear")) return true;
    if (a.startsWith("tag") || a.startsWith("steer")) return false;
    return false;
  };

  // Only duplicate Pressure/Tread, never Push Rod or other rows.
  const isDualizableMetric = (metric: string) =>
    /tire\s*pressure/i.test(metric) || /(tire\s*)?tread\s*depth|tire\s*tread/i.test(metric);
  const hasInnerOuter = (metric: string) => /(inner|outer)/i.test(metric);

  /** Expand dual-tire rows for drive/trailer/rear axles. */
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

      const unit = (it.unit ?? "") || (unitHint ? unitHint(label) : "") || "";
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
      const left = expandDuals(axle, sides.Left).sort((a, b) => orderCompare(a.metric, b.metric));
      const right = expandDuals(axle, sides.Right).sort((a, b) => orderCompare(a.metric, b.metric));
      return { axle, left, right };
    });
  }, [items, unitHint]);

  // UI toggles
  const [open, setOpen] = useState(true);
  const [showKpa, setShowKpa] = useState(true);

  const [filledMap, setFilledMap] = useState<Record<number, boolean>>(() => {
    const m: Record<number, boolean> = {};
    items.forEach((it, i) => (m[i] = !!String(it.value ?? "").trim()));
    return m;
  });
  const count = (cells: MetricCell[]) => cells.reduce((a, r) => a + (filledMap[r.idx] ? 1 : 0), 0);

  const commit = (idx: number, el: HTMLInputElement | null) => {
    if (!el) return;
    const value = el.value;
    updateItem(sectionIndex, idx, { value });
    const has = value.trim().length > 0;
    setFilledMap((p) => (p[idx] === has ? p : { ...p, [idx]: has }));
  };

  const kpaFromPsi = (psiStr: string) => {
    const n = Number(psiStr);
    return isFinite(n) ? Math.round(n * 6.894757) : null;
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
    return Array.from(map.values()).sort((a, b) => orderCompare(a.metric, b.metric));
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
      if (!isPressure) return unit;
      const k = kpaFromPsi(defaultValue);
      return showKpaHint ? `psi (${k ?? "—"} kPa)` : "psi";
    };

    const onInput = (e: React.FormEvent<HTMLInputElement>) => {
      if (!isPressure || !spanRef.current) return;
      const k = kpaFromPsi(e.currentTarget.value);
      spanRef.current.textContent = showKpaHint ? `psi (${k ?? "—"} kPa)` : "psi";
    };

    return (
      <div className="relative w-40">
        <input
          name={`air-${idx}`}
          defaultValue={defaultValue}
          className="w-full rounded border border-gray-600 bg-black px-2 py-1 pr-16 text-sm text-white outline-none placeholder:text-zinc-400"
          placeholder="Value"
          autoComplete="off"
          inputMode="decimal"
          onInput={onInput}
          onBlur={(e) => commit(idx, e.currentTarget)}
          onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
        />
        <span
          ref={spanRef}
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 whitespace-nowrap text-[11px] text-zinc-400"
        >
          {seedText()}
        </span>
      </div>
    );
  };

  const AxleCard = ({ g }: { g: AxleGroup }) => {
    const rows = buildTriplets(g);
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
        <div
          className="mb-3 text-lg font-semibold text-orange-400"
          style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}
        >
          {g.axle}
        </div>

        <div className="mb-2 grid grid-cols-[1fr_auto_1fr] items-center gap-4 text-xs text-zinc-400">
          <div>Left</div>
          <div className="text-center">Item</div>
          <div className="text-right">Right</div>
        </div>

        {open && (
          <div className="space-y-3">
            {rows.map((row, i) => {
              const leftUnit =
                row.left?.unit ?? (unitHint ? unitHint(row.left?.fullLabel ?? "") : "") ?? "";
              const rightUnit =
                row.right?.unit ?? (unitHint ? unitHint(row.right?.fullLabel ?? "") : "") ?? "";
              return (
                <div
                  key={`${row.metric}-${i}`}
                  className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 rounded bg-zinc-950/70 p-3"
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
                      <div className="h-[30px]" />
                    )}
                  </div>

                  <div
                    className="min-w-0 truncate text-center text-sm font-semibold text-white"
                    style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}
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
                        showKpaHint={showKpa}
                      />
                    ) : (
                      <div className="h-[30px]" />
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
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3 px-1">
        <div
          className="hidden text-xs text-zinc-400 md:block"
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
          <label className="flex select-none items-center gap-2 text-xs text-zinc-300">
            <input
              type="checkbox"
              className="h-3 w-3 accent-orange-500"
              checked={showKpa}
              onChange={(e) => setShowKpa(e.target.checked)}
            />
            kPa hint
          </label>

          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded bg-zinc-700 px-2 py-1 text-xs text-white hover:bg-zinc-600"
          >
            {open ? "Collapse" : "Expand"}
          </button>
        </div>
      </div>

      {onAddAxle && <AddAxlePicker groups={groups} onAddAxle={onAddAxle} />}

      {groups.map((g) => (
        <AxleCard key={g.axle} g={g} />
      ))}
    </div>
  );
}

/** Inline axle picker (unchanged) */
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
    <div className="flex items-center gap-2">
      <select
        className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-sm text-white"
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
        className="rounded bg-orange-600 px-3 py-1 text-sm font-semibold text-black hover:bg-orange-500 disabled:opacity-40"
        onClick={() => pending && onAddAxle(pending)}
        disabled={!pending}
      >
        + Add
      </button>
    </div>
  );
}
