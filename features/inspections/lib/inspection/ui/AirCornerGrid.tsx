"use client";

import { useMemo, useState } from "react";
import { useInspectionForm } from "@inspections/lib/inspection/ui/InspectionFormContext";
import type { InspectionItem } from "@inspections/lib/inspection/types";

/**
 * AirCornerGrid
 * - Groups rows by axle (e.g., "Steer 1") and by side ("Left"/"Right")
 * - New layout: 3 columns per row => Left value | Item (centered) | Right value
 * - Units appear INSIDE the value inputs (right-aligned). For Tire Pressure:
 *     - Always shows "psi"
 *     - Optional live kPa hint "(### kPa)" when the top-right checkbox is enabled
 * - Inputs are controlled (fixes single-character glitch) and commit on blur/Enter
 * - Tabbing works naturally left→center→right across rows
 * - Toolbar counters + Collapse + Add-Axle picker preserved
 */

type Props = {
  sectionIndex: number;
  items: InspectionItem[];
  unitHint?: (label: string) => string;
  /** Provide to enable the Add-Axle control */
  onAddAxle?: (axleLabel: string) => void;
};

export default function AirCornerGrid({
  sectionIndex,
  items,
  unitHint,
  onAddAxle,
}: Props) {
  const { updateItem } = useInspectionForm();

  type Side = "Left" | "Right";
  const labelRe = /^(?<axle>.+?)\s+(?<side>Left|Right)\s+(?<metric>.+)$/i;

  type MetricCell = {
    metric: string;
    idx: number;
    unit?: string | null;
    fullLabel: string;
    isPressure: boolean;
  };

  type AxleGroup = {
    axle: string;
    left: MetricCell[];
    right: MetricCell[];
  };

  /* ------------------------------------------------------------------------ */
  /* Sorting order within each side                                           */
  /* ------------------------------------------------------------------------ */

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
    const i = metricOrder.findIndex((m) =>
      metric.toLowerCase().includes(m.toLowerCase()),
    );
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };

  /* ------------------------------------------------------------------------ */
  /* Grouping: Axle -> { Left[], Right[] }                                    */
  /* ------------------------------------------------------------------------ */

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
      });
    });

    return Array.from(byAxle.entries()).map(([axle, sides]) => ({
      axle,
      left: sides.Left.sort((a, b) => orderIndex(a.metric) - orderIndex(b.metric)),
      right: sides.Right.sort((a, b) => orderIndex(a.metric) - orderIndex(b.metric)),
    }));
  }, [items, unitHint]);

  /* ------------------------------------------------------------------------ */
  /* UI State                                                                  */
  /* ------------------------------------------------------------------------ */

  // Global expand/collapse
  const [open, setOpen] = useState(true);

  // Top-right: kPa hint toggle (for Tire Pressure only)
  const [showKpa, setShowKpa] = useState<boolean>(true);

  // Track "filled" per item index for the toolbar counters
  const [filledMap, setFilledMap] = useState<Record<number, boolean>>(() => {
    const m: Record<number, boolean> = {};
    items.forEach((it, i) => (m[i] = !!String(it.value ?? "").trim()));
    return m;
  });

  // Controlled-value store to prevent the single-character glitch
  const [values, setValues] = useState<Record<number, string>>(() => {
    const v: Record<number, string> = {};
    items.forEach((it, i) => (v[i] = String(it.value ?? "")));
    return v;
  });

  const setValue = (idx: number, next: string) =>
    setValues((p) => (p[idx] === next ? p : { ...p, [idx]: next }));

  const commit = (idx: number, el: HTMLInputElement | null) => {
    if (!el) return;
    const value = el.value;
    updateItem(sectionIndex, idx, { value });
    const has = value.trim().length > 0;
    setFilledMap((p) => (p[idx] === has ? p : { ...p, [idx]: has }));
    setValue(idx, value); // keep local in sync after commit
  };

  // Counter util
  const count = (cells: MetricCell[]) =>
    cells.reduce((a, r) => a + (filledMap[r.idx] ? 1 : 0), 0);

  // Quick psi→kPa helper for hint
  const kpaFromPsi = (psiStr: string | undefined) => {
    const n = Number(psiStr);
    if (!isFinite(n)) return "—";
    return String(Math.round(n * 6.894757));
  };

  /* ------------------------------------------------------------------------ */
  /* Input With Inline Unit                                                    */
  /* ------------------------------------------------------------------------ */

  /**
   * InputWithUnit
   * - Controlled input with unit text rendered inside the field (right side)
   * - When `isPressure` === true:
   *    - Renders "psi" and, if `showKpa`, also "(### kPa)" updated live
   */
  const InputWithUnit = ({
    idx,
    unit,
    isPressure,
  }: {
    idx: number;
    unit: string;
    isPressure?: boolean;
  }) => {
    const val = values[idx] ?? "";

    // Compose inline unit text
    const unitText = isPressure
      ? showKpa
        ? `psi (${kpaFromPsi(val)} kPa)`
        : "psi"
      : unit;

    return (
      <div className="relative w-40">
        <input
          value={val}
          onChange={(e) => setValue(idx, e.target.value)}
          onBlur={(e) => commit(idx, e.currentTarget)}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
          }}
          name={`air-${idx}`}
          className="w-full rounded border border-gray-600 bg-black px-2 py-1 pr-16 text-sm text-white outline-none placeholder:text-zinc-400"
          placeholder="Value"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          inputMode="decimal"
        />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 whitespace-nowrap text-[11px] text-zinc-400">
          {unitText}
        </span>
      </div>
    );
  };

  /* ------------------------------------------------------------------------ */
  /* Row layout:  Left value | Item label | Right value                        */
  /* ------------------------------------------------------------------------ */

  type RowTriplet = {
    metric: string;
    left?: MetricCell;
    right?: MetricCell;
  };

  const buildTriplets = (g: AxleGroup): RowTriplet[] => {
    const all = new Map<string, RowTriplet>();
    for (const c of g.left) {
      const key = c.metric.toLowerCase();
      if (!all.has(key)) all.set(key, { metric: c.metric, left: c });
      else all.get(key)!.left = c;
    }
    for (const c of g.right) {
      const key = c.metric.toLowerCase();
      if (!all.has(key)) all.set(key, { metric: c.metric, right: c });
      else all.get(key)!.right = c;
    }
    // Sort by our metricOrder
    const arr = Array.from(all.values());
    arr.sort(
      (a, b) => orderIndex(a.metric) - orderIndex(b.metric),
    );
    return arr;
  };

  /* ------------------------------------------------------------------------ */
  /* Per-axle Card                                                             */
  /* ------------------------------------------------------------------------ */

  const AxleCard = ({ g }: { g: AxleGroup }) => {
    const rows = buildTriplets(g);
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
        {/* Axle Title */}
        <div
          className="mb-3 text-lg font-semibold text-orange-400"
          style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}
        >
          {g.axle}
        </div>

        {/* Header Row: Left | Item | Right */}
        <div className="mb-2 grid grid-cols-[1fr_auto_1fr] items-center gap-4 text-xs text-zinc-400">
          <div className="">Left</div>
          <div className="text-center">Item</div>
          <div className="text-right">Right</div>
        </div>

        {/* Data Rows */}
        {open && (
          <div className="space-y-3">
            {rows.map((row, i) => {
              const leftUnit =
                row.left?.unit ??
                (unitHint ? unitHint(row.left?.fullLabel ?? "") : "");
              const rightUnit =
                row.right?.unit ??
                (unitHint ? unitHint(row.right?.fullLabel ?? "") : "");

              return (
                <div
                  key={`${row.metric}-${i}`}
                  className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 rounded bg-zinc-950/70 p-3"
                >
                  {/* Left value */}
                  <div className="">
                    {row.left ? (
                      <InputWithUnit
                        idx={row.left.idx}
                        unit={leftUnit}
                        isPressure={row.left.isPressure}
                      />
                    ) : (
                      <div className="h-[30px]" />
                    )}
                  </div>

                  {/* Item label (center) */}
                  <div
                    className="min-w-0 truncate text-center text-sm font-semibold text-white"
                    style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}
                    title={row.metric}
                  >
                    {row.metric}
                  </div>

                  {/* Right value */}
                  <div className="justify-self-end">
                    {row.right ? (
                      <InputWithUnit
                        idx={row.right.idx}
                        unit={rightUnit}
                        isPressure={row.right.isPressure}
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

  /* ------------------------------------------------------------------------ */
  /* Render                                                                    */
  /* ------------------------------------------------------------------------ */

  return (
    <div className="grid gap-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 px-1">
        {/* Per-axle counters */}
        <div
          className="hidden text-xs text-zinc-400 md:block"
          style={{ fontFamily: "Roboto, system-ui, sans-serif" }}
        >
          {groups.map((g, i) => {
            const leftFilled = count(g.left);
            const rightFilled = count(g.right);
            const filled = leftFilled + rightFilled;
            const total = g.left.length + g.right.length;
            return (
              <span key={g.axle}>
                {g.axle} {filled}/{total}
                {i < groups.length - 1 ? "  |  " : ""}
              </span>
            );
          })}
        </div>

        {/* Right-side controls: kPa hint + Collapse */}
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

      {/* Optional: Add-Axle control */}
      {onAddAxle && <AddAxlePicker groups={groups} onAddAxle={onAddAxle} />}

      {/* Axles */}
      {groups.map((g) => (
        <AxleCard key={g.axle} g={g} />
      ))}
    </div>
  );
}

/* ========================================================================== */
/* Inline Add-Axle Picker (unchanged logic)                                   */
/* ========================================================================== */

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