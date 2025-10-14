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

  type Row = {
    idx: number;
    metric: string;
    labelForHint: string;
    unit?: string | null;
    isPressure: boolean;
  };

  type AxleGroup = {
    axle: string;
    left: Row[];
    right: Row[];
  };

  const metricOrder = [
    "Tire Pressure",
    "Tread Depth",
    "Lining/Shoe",
    "Drum/Rotor",
    "Push Rod Travel",
    "Wheel Torque Inner",
    "Wheel Torque Outer",
  ];
  const orderIndex = (m: string) => {
    const i = metricOrder.findIndex((x) => m.toLowerCase().includes(x.toLowerCase()));
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };

  const groups: AxleGroup[] = useMemo(() => {
    const byAxle = new Map<string, { Left: Row[]; Right: Row[] }>();

    items.forEach((it, idx) => {
      const label = it.item ?? "";
      const m = label.match(labelRe);
      if (!m?.groups) return;

      const axle = m.groups.axle.trim();
      const side = (m.groups.side as Side) || "Left";
      const metric = m.groups.metric.trim();

      if (!byAxle.has(axle)) byAxle.set(axle, { Left: [], Right: [] });

      const row: Row = {
        idx,
        metric,
        labelForHint: label,
        unit: it.unit ?? (unitHint ? unitHint(label) : ""),
        isPressure: /tire\s*pressure/i.test(metric),
      };

      byAxle.get(axle)![side].push(row);
    });

    return Array.from(byAxle.entries()).map(([axle, sides]) => ({
      axle,
      left: sides.Left.sort((a, b) => orderIndex(a.metric) - orderIndex(b.metric)),
      right: sides.Right.sort((a, b) => orderIndex(a.metric) - orderIndex(b.metric)),
    }));
  }, [items, unitHint]);

  /* ------------------------- simple, stable behaviors ------------------------- */
  const [open, setOpen] = useState(true);
  const [showKpaHint, setShowKpaHint] = useState(true);

  const commit = (idx: number, el: HTMLInputElement | null) => {
    if (!el) return;
    updateItem(sectionIndex, idx, { value: el.value });
  };

  /* ------------------------------- row view ---------------------------------- */
  const RowView = ({ row }: { row: Row }) => {
    const onInput = (e: React.FormEvent<HTMLInputElement>) => {
      if (!row.isPressure) return;
      const span =
        (e.currentTarget.parentElement?.querySelector('[data-kpa="1"]') as HTMLSpanElement) ||
        undefined;
      if (!span) return;
      const n = parseFloat(e.currentTarget.value);
      span.textContent =
        isFinite(n) && showKpaHint ? `(${Math.round(n * 6.894757)} kPa)` : "";
    };

    return (
      <div className="rounded bg-zinc-950/70 p-3">
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
            onInput={onInput}
            onBlur={(e) => commit(row.idx, e.currentTarget)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
            }}
          />

          <div className="text-right text-xs text-zinc-400">
            {row.isPressure ? (
              <span>
                psi{" "}
                <span data-kpa="1" className={showKpaHint ? "text-zinc-500" : "hidden"} />
              </span>
            ) : (
              <span>{row.unit ?? (unitHint ? unitHint(row.labelForHint) : "")}</span>
            )}
          </div>
        </div>
      </div>
    );
  };

  const SideCard = ({ title, rows }: { title: "Left" | "Right"; rows: Row[] }) => (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
      <div
        className="mb-2 font-semibold text-orange-400"
        style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}
      >
        {title}
      </div>

      {open && (
        <div className="space-y-3">
          {rows.map((r) => (
            <RowView key={r.idx} row={r} />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="grid gap-3">
      {/* Top-right controls (match CornerGrid) */}
      <div className="flex items-center justify-end gap-3 px-1">
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
          <div
            className="mb-3 text-lg font-semibold text-orange-400"
            style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}
          >
            {g.axle}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <SideCard title="Left" rows={g.left} />
            <SideCard title="Right" rows={g.right} />
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