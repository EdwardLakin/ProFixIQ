"use client";

import { useMemo, useRef, useState } from "react";
import { useInspectionForm } from "@inspections/lib/inspection/ui/InspectionFormContext";
import type { InspectionItem } from "@inspections/lib/inspection/types";

type Props = {
  sectionIndex: number;
  items: InspectionItem[];
  unitHint?: (label: string) => string;
};

type CornerKey = "LF" | "RF" | "LR" | "RR";
type Side = "Left" | "Right";
type Region = "Front" | "Rear";

/** LF/RF/LR/RR → (Left/Right, Front/Rear) */
const cornerToRegion: Record<CornerKey, { side: Side; region: Region }> = {
  LF: { side: "Left",  region: "Front" },
  RF: { side: "Right", region: "Front" },
  LR: { side: "Left",  region: "Rear"  },
  RR: { side: "Right", region: "Rear"  },
};

const abbrevRE = /^(?<corner>LF|RF|LR|RR)\s+(?<metric>.+)$/i;
const fullRE   = /^(?<corner>(Left|Right)\s+(Front|Rear))\s+(?<metric>.+)$/i;

const metricOrder = [
  "Tire Pressure",
  "Tire Tread",
  "Brake Pad",
  "Rotor",
  "Rotor Condition",
  "Rotor Thickness",
  "Wheel Torque",
];
const orderIndex = (m: string) => {
  const i = metricOrder.findIndex((x) => m.toLowerCase().includes(x.toLowerCase()));
  return i === -1 ? Number.MAX_SAFE_INTEGER : i;
};

export default function CornerGrid({ sectionIndex, items, unitHint }: Props) {
  const { updateItem } = useInspectionForm();

  /** Parse an item label into corner + metric */
  const parseCorner = (label: string): { corner: CornerKey | null; metric: string } => {
    let corner: CornerKey | null = null;
    let metric = "";

    const m1 = label.match(abbrevRE);
    if (m1?.groups) {
      corner = (m1.groups.corner.toUpperCase() as CornerKey) || null;
      metric = m1.groups.metric.trim();
      return { corner, metric };
    }

    const m2 = label.match(fullRE);
    if (m2?.groups) {
      const c = m2.groups.corner.toLowerCase();
      if (c === "left front")  corner = "LF";
      if (c === "right front") corner = "RF";
      if (c === "left rear")   corner = "LR";
      if (c === "right rear")  corner = "RR";
      metric = m2.groups.metric.trim();
      return { corner, metric };
    }

    return { corner: null, metric: "" };
  };

  /** Row cell info for each side */
  type MetricCell = {
    idx: number;
    metric: string;
    unit: string;
    fullLabel: string;
    isPressure: boolean;
    initial: string;
  };

  /** A single row in the 3-column grid */
  type RowTriplet = { metric: string; left?: MetricCell; right?: MetricCell };

  /** Group by region (Front/Rear), then merge Left+Right by metric */
  const groups = useMemo(() => {
    const byRegion = new Map<Region, Map<string, RowTriplet>>();
    const ensureRegion = (r: Region) => byRegion.get(r) ?? byRegion.set(r, new Map()).get(r)!;

    items.forEach((it, idx) => {
      const label = it.item ?? "";
      const { corner, metric } = parseCorner(label);
      if (!corner) return;

      const { side, region } = cornerToRegion[corner];
      const reg = ensureRegion(region);

      const key = metric.toLowerCase();
      if (!reg.has(key)) reg.set(key, { metric });

      const unit =
        (it.unit ?? "") || (unitHint ? unitHint(label) : "") || "";
      const cell: MetricCell = {
        idx,
        metric,
        unit,
        fullLabel: label,
        isPressure: /pressure/i.test(metric),
        initial: String(it.value ?? ""),
      };

      const row = reg.get(key)!;
      if (side === "Left") row.left = cell;
      else row.right = cell;
    });

    // Sort rows inside each region by our metricOrder
    const sorted: Array<{ region: Region; rows: RowTriplet[] }> = [];
    (["Front", "Rear"] as Region[]).forEach((region) => {
      const reg = byRegion.get(region);
      if (!reg) return;
      const rows = Array.from(reg.values()).sort(
        (a, b) => orderIndex(a.metric) - orderIndex(b.metric)
      );
      sorted.push({ region, rows });
    });

    return sorted;
  }, [items, unitHint]);

  /** Collapsible & hint toggle (kept behavior) */
  const [open, setOpen] = useState(true);
  const [showKpaHint, setShowKpaHint] = useState(true);

  /** Track which inputs are “filled” only after commit */
  const [, setFilledMap] = useState<Record<number, boolean>>(() => {
    const m: Record<number, boolean> = {};
    items.forEach((it, i) => (m[i] = !!String(it.value ?? "").trim()));
    return m;
  });
  const commit = (idx: number, el: HTMLInputElement | null) => {
    if (!el) return;
    const value = el.value;
    updateItem(sectionIndex, idx, { value });
    const has = value.trim().length > 0;
    setFilledMap((p) => (p[idx] === has ? p : { ...p, [idx]: has }));
  };

  /** kPa calc */
  const kpaFromPsi = (psiStr: string) => {
    const n = Number(psiStr);
    return isFinite(n) ? Math.round(n * 6.894757) : null;
  };

  /** Single input cell, preserves your original text-entry behavior */
  const InputCell = ({
    idx,
    defaultValue,
    isPressure,
    unit,
    tabIndex,
  }: {
    idx: number;
    defaultValue: string;
    isPressure: boolean;
    unit: string;
    tabIndex: number;
  }) => {
    const kpaRef = useRef<HTMLSpanElement | null>(null);
    const onInput = (e: React.FormEvent<HTMLInputElement>) => {
      if (!isPressure || !kpaRef.current) return;
      const k = kpaFromPsi(e.currentTarget.value);
      kpaRef.current.textContent = showKpaHint ? `(${k ?? "—"} kPa)` : "";
    };
    return (
      <div className="flex items-center gap-2">
        <input
          name={`hyd-${idx}`}
          defaultValue={defaultValue}
          tabIndex={tabIndex}
          className="w-40 rounded border border-gray-600 bg-black px-2 py-1 text-sm text-white outline-none placeholder:text-zinc-400"
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
        <div className="text-right text-xs text-zinc-400 min-w-[64px]">
          {isPressure ? (
            <span>
              psi <span ref={kpaRef} className={showKpaHint ? "text-zinc-500" : "hidden"} />
            </span>
          ) : (
            <span>{unit}</span>
          )}
        </div>
      </div>
    );
  };

  // Sequential tab index (Left → Right top to bottom)
  let nextTab = 1;

  const RegionCard = ({ region, rows }: { region: Region; rows: RowTriplet[] }) => (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
      <div
        className="mb-3 text-lg font-semibold text-orange-400"
        style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}
      >
        {region}
      </div>

      <div className="mb-2 grid grid-cols-[1fr_auto_1fr] items-center gap-4 text-xs text-zinc-400">
        <div>Left</div>
        <div className="text-center">Item</div>
        <div className="text-right">Right</div>
      </div>

      {open && (
        <div className="space-y-3">
          {rows.map((row, i) => (
            <div
              key={`${region}-${row.metric}-${i}`}
              className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 rounded bg-zinc-950/70 p-3"
            >
              {/* Left input */}
              <div>
                {row.left ? (
                  <InputCell
                    idx={row.left.idx}
                    defaultValue={row.left.initial}
                    isPressure={row.left.isPressure}
                    unit={row.left.unit}
                    tabIndex={nextTab++}
                  />
                ) : (
                  <div className="h-[30px]" />
                )}
              </div>

              {/* Center metric label */}
              <div
                className="min-w-0 truncate text-center text-sm font-semibold text-white"
                style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}
                title={row.metric}
              >
                {row.metric}
              </div>

              {/* Right input */}
              <div className="justify-self-end">
                {row.right ? (
                  <InputCell
                    idx={row.right.idx}
                    defaultValue={row.right.initial}
                    isPressure={row.right.isPressure}
                    unit={row.right.unit}
                    tabIndex={nextTab++}
                  />
                ) : (
                  <div className="h-[30px]" />
                )}
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
        <label className="flex items-center gap-2 text-xs text-zinc-400 select-none">
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

      {/* Two region cards: Front & Rear (each uses 3-column rows) */}
      <div className="grid gap-4">
        {groups.map((g) => (
          <RegionCard key={g.region} region={g.region} rows={g.rows} />
        ))}
      </div>
    </div>
  );
}