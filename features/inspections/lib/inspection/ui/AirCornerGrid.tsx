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

  // UI
  const [open, setOpen] = useState(true);
  const [showKpaHint, setShowKpaHint] = useState(true);

  const psiToKpa = (psiStr: string): string => {
    const n = parseFloat(psiStr);
    if (!isFinite(n)) return "";
    return String(Math.round(n * 6.894757));
  };

  const commit = (idx: number, el: HTMLInputElement | null) => {
    if (!el) return;
    const value = el.value;
    updateItem(sectionIndex, idx, { value });
  };

  const PressureUnit = ({
    row,
    inputRef,
  }: {
    row: MetricCell;
    inputRef: React.RefObject<HTMLInputElement>;
  }) => {
    // span updated imperatively; no setState on keypress
    const kpaRef = useRef<HTMLSpanElement>(null);

    const updateKpa = () => {
      if (!kpaRef.current || !inputRef.current) return;
      const next = psiToKpa(inputRef.current.value || "");
      kpaRef.current.textContent = next ? `(${next} kPa)` : "";
    };

    return (
      <span className="text-right text-xs text-zinc-400">
        <span>psi</span>{" "}
        <span ref={kpaRef} className={showKpaHint ? "text-zinc-500" : "hidden"} />
        {/* initialize from defaultValue once the input mounts */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function(){
                const inp = document.querySelector('input[name="air-${row.idx}"]');
                const span = document.currentScript.previousElementSibling;
                if (inp && span) {
                  const toKpa = v => {
                    var n = parseFloat(v);
                    if (!isFinite(n)) return "";
                    return "(" + Math.round(n * 6.894757) + " kPa)";
                  };
                  span.textContent = ${showKpaHint ? "toKpa(inp.value||'')" : "''"};
                }
              })();
            `,
          }}
        />
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
          {cells.map((row) => {
            const isPressure = row.metric.toLowerCase().includes("tire pressure");
            const inputRef = useRef<HTMLInputElement>(null);

            const onInput = (e: React.FormEvent<HTMLInputElement>) => {
              // update kPa hint imperatively; do not set React state
              const span =
                (e.currentTarget.parentElement?.querySelector('[data-kpa="1"]') as HTMLSpanElement) ||
                undefined;
              if (!span) return;
              const n = parseFloat(e.currentTarget.value);
              span.textContent = isFinite(n) && showKpaHint ? `(${Math.round(n * 6.894757)} kPa)` : "";
            };

            return (
              <div key={row.idx} className="rounded bg-zinc-950/70 p-3">
                <div className="flex items-center gap-3">
                  <div
                    className="min-w-0 grow truncate text-sm font-semibold text-white"
                    style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}
                  >
                    {row.metric}
                  </div>

                  <input
                    ref={inputRef}
                    name={`air-${row.idx}`}
                    defaultValue={String(items[row.idx]?.value ?? "")}
                    className="w-40 rounded border border-gray-600 bg-black px-2 py-1 text-sm text-white outline-none placeholder:text-zinc-400"
                    placeholder="Value"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    inputMode="decimal"
                    onInput={isPressure ? onInput : undefined}
                    onBlur={(e) => commit(row.idx, e.currentTarget)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
                    }}
                  />

                  <div className="text-right text-xs text-zinc-400">
                    {isPressure ? (
                      <span>
                        psi{" "}
                        <span data-kpa="1" className={showKpaHint ? "text-zinc-500" : "hidden"} />
                      </span>
                    ) : (
                      <span>{row.unit ?? (unitHint ? unitHint(row.fullLabel) : "")}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div className="grid gap-3">
      {/* Toolbar */}
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