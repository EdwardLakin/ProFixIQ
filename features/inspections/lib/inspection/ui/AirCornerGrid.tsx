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
    unit?: string | null;
    fullLabel: string;
    isPressure: boolean;
    /** used to seed the hint without controlling the input */
    initial: string;
  };
  type AxleGroup = { axle: string; left: MetricCell[]; right: MetricCell[] };

  const metricOrder = [
    "Tire Pressure",
    "Tread Depth",
    "Lining/Shoe",
    "Drum/Rotor",
    "Push Rod Travel",
    "Wheel Torque Inner",
    "Wheel Torque Outer",
  ];
  const orderIndex = (metric: string) => {
    const i = metricOrder.findIndex((m) => metric.toLowerCase().includes(m.toLowerCase()));
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };

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
      byAxle.get(axle)![side].push({
        metric,
        idx,
        unit: it.unit ?? (unitHint ? unitHint(label) : ""),
        fullLabel: label,
        isPressure: /pressure/i.test(metric),
        initial: String(it.value ?? ""),
      });
    });

    return Array.from(byAxle.entries()).map(([axle, sides]) => ({
      axle,
      left: sides.Left.sort((a, b) => orderIndex(a.metric) - orderIndex(b.metric)),
      right: sides.Right.sort((a, b) => orderIndex(a.metric) - orderIndex(b.metric)),
    }));
  }, [items, unitHint]);

  // UI toggles
  const [open, setOpen] = useState(true);
  const [showKpa, setShowKpa] = useState(true);

  // “filled” counter (updates only when committing)
  const [filledMap, setFilledMap] = useState<Record<number, boolean>>(() => {
    const m: Record<number, boolean> = {};
    items.forEach((it, i) => (m[i] = !!String(it.value ?? "").trim()));
    return m;
  });
  const count = (cells: MetricCell[]) => cells.reduce((a, r) => a + (filledMap[r.idx] ? 1 : 0), 0);

  // commit like CornerGrid
  const commit = (idx: number, el: HTMLInputElement | null) => {
    if (!el) return;
    const value = el.value;
    updateItem(sectionIndex, idx, { value });
    const has = value.trim().length > 0;
    setFilledMap((p) => (p[idx] === has ? p : { ...p, [idx]: has }));
  };

  // helpers
  const kpaFromPsi = (psiStr: string) => {
    const n = Number(psiStr);
    return isFinite(n) ? Math.round(n * 6.894757) : null;
  };

  // Row triplets to render center “Item”
  type RowTriplet = { metric: string; left?: MetricCell; right?: MetricCell };
  const buildTriplets = (g: AxleGroup): RowTriplet[] => {
    const map = new Map<string, RowTriplet>();
    for (const c of g.left) {
      const k = c.metric.toLowerCase();
      map.set(k, { ...(map.get(k) || { metric: c.metric }), metric: c.metric, left: c, right: map.get(k)?.right });
    }
    for (const c of g.right) {
      const k = c.metric.toLowerCase();
      map.set(k, { ...(map.get(k) || { metric: c.metric }), metric: c.metric, right: c, left: map.get(k)?.left });
    }
    const arr = Array.from(map.values());
    arr.sort((a, b) => orderIndex(a.metric) - orderIndex(b.metric));
    return arr;
  };

  // Uncontrolled input with unit INSIDE and live kPa hint via onInput (CornerGrid style)
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
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          inputMode="decimal"
          onInput={onInput}
          onBlur={(e) => commit(idx, e.currentTarget)}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
          }}
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
                row.left?.unit ?? (unitHint ? unitHint(row.left?.fullLabel ?? "") : "");
              const rightUnit =
                row.right?.unit ?? (unitHint ? unitHint(row.right?.fullLabel ?? "") : "");
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
      {/* Toolbar */}
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
            aria-expanded={open}
            title={open ? "Collapse" : "Expand"}
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