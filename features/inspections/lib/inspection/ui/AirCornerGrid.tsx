// features/inspections/lib/inspection/ui/AirCornerGrid.tsx
"use client";

import { useMemo, useState } from "react";
import { useInspectionForm } from "@inspections/lib/inspection/ui/InspectionFormContext";
import type { InspectionItem } from "@inspections/lib/inspection/types";

type Props = {
  sectionIndex: number;
  items: InspectionItem[];
  unitHint?: (label: string) => string;
  /** Provide to enable the Add-Axle control */
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
    "Wheel Torque", // catch-all
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
      });
    });

    return Array.from(byAxle.entries()).map(([axle, sides]) => ({
      axle,
      left: sides.Left.sort((a, b) => orderIndex(a.metric) - orderIndex(b.metric)),
      right: sides.Right.sort((a, b) => orderIndex(a.metric) - orderIndex(b.metric)),
    }));
  }, [items, unitHint]);

  // Collapse + per-row "is filled" (updates only on commit)
  const [open, setOpen] = useState(true);
  const [filledMap, setFilledMap] = useState<Record<number, boolean>>(() => {
    const m: Record<number, boolean> = {};
    items.forEach((it, i) => (m[i] = !!String(it.value ?? "").trim()));
    return m;
  });

  // kPa hint toggle (top-right)
  const [showKpa, setShowKpa] = useState<boolean>(true);

  // Lightweight live mirror ONLY for kPa hint (inputs themselves are uncontrolled)
  const [livePressure, setLivePressure] = useState<Record<number, string>>({});

  const commit = (idx: number, el: HTMLInputElement | null) => {
    if (!el) return;
    const value = el.value;
    updateItem(sectionIndex, idx, { value });
    const has = value.trim().length > 0;
    setFilledMap((p) => (p[idx] === has ? p : { ...p, [idx]: has }));
    // keep live mirror in sync after commit
    setLivePressure((p) => ({ ...p, [idx]: value }));
  };

  const count = (cells: MetricCell[]) => cells.reduce((a, r) => a + (filledMap[r.idx] ? 1 : 0), 0);

  const kpaFromPsi = (psiStr: string | undefined) => {
    const n = Number(psiStr);
    if (!isFinite(n)) return null;
    return Math.round(n * 6.894757); // simple rounded hint
  };

  /** Build merged rows: metric centered, left/right inputs flanking */
  type MergedRow = { metric: string; left?: MetricCell; right?: MetricCell };
  const mergeRows = (g: AxleGroup): MergedRow[] => {
    const map = new Map<string, MergedRow>();
    const put = (m: MetricCell, side: "left" | "right") => {
      const key = m.metric.toLowerCase();
      const row = map.get(key) ?? { metric: m.metric };
      (row as any)[side] = m;
      map.set(key, row);
    };
    g.left.forEach((c) => put(c, "left"));
    g.right.forEach((c) => put(c, "right"));
    return Array.from(map.values()).sort(
      (a, b) => orderIndex(a.metric) - orderIndex(b.metric),
    );
  };

  const UnitOrHint = ({
    cell,
    current,
  }: {
    cell?: MetricCell;
    current: string;
  }) => {
    if (!cell) return <span className="invisible">—</span>;
    if (cell.isPressure) {
      const kpa = showKpa ? kpaFromPsi(current) : null;
      return (
        <>
          <span className="text-zinc-300">psi</span>
          {showKpa && <span className="ml-1 text-zinc-400">({kpa ?? "—"} kPa)</span>}
        </>
      );
    }
    return <>{cell.unit ?? (unitHint ? unitHint(cell.fullLabel) : "")}</>;
  };

  const ValueInput = ({ cell }: { cell?: MetricCell }) => {
    if (!cell) {
      // keep row height consistent
      return <div className="h-8" />;
    }
    const defaultVal = String(items[cell.idx]?.value ?? "");
    const psiNow = livePressure[cell.idx] ?? defaultVal;

    return (
      <div className="flex items-center gap-2">
        <input
          name={`air-${cell.idx}`}
          defaultValue={defaultVal}
          className="w-36 rounded border border-gray-600 bg-black px-2 py-1 text-sm text-white outline-none placeholder:text-zinc-400"
          placeholder="Value"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          inputMode="decimal"
          onInput={(e) => {
            if (cell.isPressure) {
              setLivePressure((p) => ({ ...p, [cell.idx]: e.currentTarget.value }));
            }
          }}
          onBlur={(e) => commit(cell.idx, e.currentTarget)}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
          }}
        />
        <div className="text-xs text-zinc-400 whitespace-nowrap">
          <UnitOrHint cell={cell} current={psiNow} />
        </div>
      </div>
    );
  };

  const AxleRow = ({ row }: { row: MergedRow }) => (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
      <ValueInput cell={row.left} />
      <div
        className="min-w-0 truncate text-sm font-semibold text-white text-center"
        style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}
      >
        {row.metric}
      </div>
      <div className="justify-self-end">
        <ValueInput cell={row.right} />
      </div>
    </div>
  );

  const AxleCard = ({ g }: { g: AxleGroup }) => {
    const rows = mergeRows(g);
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
        <div
          className="mb-3 text-lg font-semibold text-orange-400"
          style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}
        >
          {g.axle}
        </div>

        {/* Header row */}
        <div className="mb-2 grid grid-cols-[1fr_auto_1fr] text-xs text-zinc-400">
          <div className="justify-self-start">Left</div>
          <div className="text-center">Item</div>
          <div className="justify-self-end">Right</div>
        </div>

        {open && (
          <div className="space-y-3">
            {rows.map((r, i) => (
              <div key={`${r.metric}-${i}`} className="rounded bg-zinc-950/70 p-3">
                <AxleRow row={r} />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="grid gap-3">
      {/* Toolbar */}
      <div className="flex items-center justify-end gap-3 px-1">
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

        {/* kPa hint toggle */}
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