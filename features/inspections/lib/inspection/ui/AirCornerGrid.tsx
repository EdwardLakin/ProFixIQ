"use client";

import { useMemo, useState } from "react";
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
      });
    });

    return Array.from(byAxle.entries()).map(([axle, sides]) => ({
      axle,
      left: sides.Left.sort((a, b) => orderIndex(a.metric) - orderIndex(b.metric)),
      right: sides.Right.sort((a, b) => orderIndex(a.metric) - orderIndex(b.metric)),
    }));
  }, [items, unitHint]);

  // Collapse + counters (updated only on commit)
  const [open, setOpen] = useState(true);
  const [filledMap, setFilledMap] = useState<Record<number, boolean>>(() => {
    const m: Record<number, boolean> = {};
    items.forEach((it, i) => (m[i] = !!String(it.value ?? "").trim()));
    return m;
  });

  // kPa hint toggle (per grid)
  const [showKpaHint, setShowKpaHint] = useState<boolean>(true);

  // live psi text while typing (for the hint only; does NOT control the input)
  const [livePsi, setLivePsi] = useState<Record<number, string>>(() => {
    const m: Record<number, string> = {};
    items.forEach((it, i) => (m[i] = String(it.value ?? "")));
    return m;
  });

  const commit = (idx: number, el: HTMLInputElement | null) => {
    if (!el) return;
    const value = el.value;
    updateItem(sectionIndex, idx, { value });
    const has = value.trim().length > 0;
    setFilledMap((p) => (p[idx] === has ? p : { ...p, [idx]: has }));
    setLivePsi((p) => (p[idx] === value ? p : { ...p, [idx]: value }));
  };

  const count = (cells: MetricCell[]) => cells.reduce((a, r) => a + (filledMap[r.idx] ? 1 : 0), 0);

  const psiToKpa = (psiStr: string): number | null => {
    const n = parseFloat(psiStr);
    if (!isFinite(n)) return null;
    return Math.round(n * 6.894757);
  };

  const UnitWithHint = ({ row }: { row: MetricCell }) => {
    const isPressure = row.metric.toLowerCase().includes("tire pressure");
    if (!isPressure) {
      return <span className="text-right text-xs text-zinc-400">{row.unit ?? (unitHint ? unitHint(row.fullLabel) : "")}</span>;
    }
    const kpa = showKpaHint ? psiToKpa(livePsi[row.idx] ?? "") : null;
    return (
      <span className="text-right text-xs text-zinc-400">
        psi {showKpaHint && kpa != null && <span className="ml-1 text-zinc-500">({kpa} kPa)</span>}
      </span>
    );
  };

  const SideCardView = ({ title, cells }: { title: string; cells: MetricCell[] }) => (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
      <div className="mb-2 font-semibold text-orange-400" style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}>
        {title}
      </div>

      {open && (
        <div className="space-y-3">
          {cells.map((row) => (
            <div key={row.idx} className="rounded bg-zinc-950/70 p-3">
              <div className="flex items-center gap-3">
                <div
                  className="min-w-0 grow truncate text-sm font-semibold text-white"
                  style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}
                >
                  {row.metric}
                </div>

                <input
                  name={`air-${row.idx}`}
                  defaultValue={String(items[row.idx]?.value ?? "")}
                  className="w-40 rounded border border-gray-600 bg-black px-2 py-1 text-sm text-white outline-none placeholder:text-zinc-400"
                  placeholder="Value"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  inputMode="decimal"
                  onInput={(e) => {
                    // update live psi preview for kPa hint without controlling the input
                    const v = (e.currentTarget as HTMLInputElement).value;
                    setLivePsi((p) => (p[row.idx] === v ? p : { ...p, [row.idx]: v }));
                  }}
                  onBlur={(e) => commit(row.idx, e.currentTarget)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
                  }}
                />
                <div className="text-right text-xs text-zinc-400">
                  <UnitWithHint row={row} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="grid gap-3">
      {/* Toolbar */}
      <div className="flex items-center justify-end gap-3 px-1">
        <div className="hidden text-xs text-zinc-400 md:block" style={{ fontFamily: "Roboto, system-ui, sans-serif" }}>
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
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          <input
            type="checkbox"
            className="h-3 w-3 accent-orange-500"
            checked={showKpaHint}
            onChange={(e) => setShowKpaHint(e.target.checked)}
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
        <div key={g.axle} className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
          <div className="mb-3 text-lg font-semibold text-orange-400" style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}>
            {g.axle}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <SideCardView title="Left" cells={g.left} />
            <SideCardView title="Right" cells={g.right} />
          </div>
        </div>
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