// features/inspections/unified/ui/CornerGrid.tsx
"use client";

import React, { useMemo, useRef, useState } from "react";
import type { InspectionItem } from "@inspections/lib/inspection/types";

type GridUnitMode = "metric" | "imperial";

type CornerKey = "LF" | "RF" | "LR" | "RR";
type Side = "Left" | "Right";
type Region = "Front" | "Rear";

const cornerToRegion: Record<CornerKey, { side: Side; region: Region }> = {
  LF: { side: "Left", region: "Front" },
  RF: { side: "Right", region: "Front" },
  LR: { side: "Left", region: "Rear" },
  RR: { side: "Right", region: "Rear" },
};

// Examples this supports:
//
//  - "LF Tire Pressure"
//  - "LR Tire Tread"
//  - "Left Front Tire Pressure"
//  - "Right Rear Rotor Thickness"
const abbrevRE = /^(?<corner>LF|RF|LR|RR)\s+(?<metric>.+)$/i;
const fullRE = /^(?<corner>(Left|Right)\s+(Front|Rear))\s+(?<metric>.+)$/i;

const metricOrder = [
  "Tire Pressure",
  "Tire Tread",
  "Brake Pad",
  "Pad Thickness",
  "Rotor",
  "Rotor Condition",
  "Rotor Thickness",
  "Wheel Torque",
];
const orderIndex = (m: string) => {
  const i = metricOrder.findIndex((x) =>
    m.toLowerCase().includes(x.toLowerCase()),
  );
  return i === -1 ? Number.MAX_SAFE_INTEGER : i;
};

function getUnitLabel(metric: string, unitMode: GridUnitMode): string {
  const lower = metric.toLowerCase();

  if (lower.includes("pressure")) {
    // Always psi here – kPa is shown as a hint.
    return "psi";
  }

  if (
    lower.includes("tread") ||
    lower.includes("pad") ||
    lower.includes("rotor") ||
    lower.includes("thickness")
  ) {
    return unitMode === "metric" ? "mm" : "in";
  }

  return unitMode === "metric" ? "mm" : "in";
}

type CornerGridProps = {
  title?: string;
  sectionIndex: number;
  items: InspectionItem[];
  unitMode: GridUnitMode;
  /** initial state for the kPa hint checkbox */
  showKpaHint: boolean;
  onUpdateItem: (
    sectionIndex: number,
    itemIndex: number,
    patch: Partial<InspectionItem>,
  ) => void;
};

type MetricCell = {
  idx: number;
  metric: string;
  unit: string;
  fullLabel: string;
  isPressure: boolean;
  initial: string;
};

type RowTriplet = { metric: string; left?: MetricCell; right?: MetricCell };

export default function CornerGrid({
  sectionIndex,
  items,
  unitMode,
  showKpaHint: showKpaInitial,
  onUpdateItem,
}: CornerGridProps) {
  const parseCorner = (
    label: string,
  ): { corner: CornerKey | null; metric: string } => {
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
      if (c === "left front") corner = "LF";
      if (c === "right front") corner = "RF";
      if (c === "left rear") corner = "LR";
      if (c === "right rear") corner = "RR";
      metric = m2.groups.metric.trim();
      return { corner, metric };
    }

    return { corner: null, metric: "" };
  };

  type RegionGroup = { region: Region; rows: RowTriplet[] };

  const groups: RegionGroup[] = useMemo(() => {
    const byRegion = new Map<
      Region,
      Map<
        string,
        {
          metric: string;
          left?: MetricCell;
          right?: MetricCell;
        }
      >
    >();

    const ensureRegion = (r: Region) =>
      byRegion.get(r) ?? byRegion.set(r, new Map()).get(r)!;

    items.forEach((it, idx) => {
      const label = it.item ?? it.name ?? "";
      if (!label) return;

      const { corner, metric } = parseCorner(label);
      if (!corner) return;

      const { side, region } = cornerToRegion[corner];
      const reg = ensureRegion(region);

      const key = metric.toLowerCase();
      if (!reg.has(key)) reg.set(key, { metric });

      const unit = (it.unit ?? "") || getUnitLabel(metric, unitMode);
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

    const sorted: RegionGroup[] = [];
    (["Front", "Rear"] as Region[]).forEach((region) => {
      const reg = byRegion.get(region);
      if (!reg) return;
      const rows = Array.from(reg.values()).sort(
        (a, b) => orderIndex(a.metric) - orderIndex(b.metric),
      );
      sorted.push({ region, rows });
    });

    return sorted;
  }, [items, unitMode]);

  const [open, setOpen] = useState(true);
  const [showKpaHint, setShowKpaHint] = useState<boolean>(showKpaInitial);

  // map item index -> “has a value”
  const [, setFilledMap] = useState<Record<number, boolean>>(() => {
    const m: Record<number, boolean> = {};
    items.forEach((it, i) => (m[i] = !!String(it.value ?? "").trim()));
    return m;
  });

  const commit = (idx: number, el: HTMLInputElement | null) => {
    if (!el) return;
    const value = el.value;
    onUpdateItem(sectionIndex, idx, { value });
    const has = value.trim().length > 0;
    setFilledMap((p) => (p[idx] === has ? p : { ...p, [idx]: has }));
  };

  const kpaFromPsi = (psiStr: string) => {
    const n = Number(psiStr);
    return Number.isFinite(n) ? Math.round(n * 6.894757) : null;
  };

  const InputCell = ({
    idx,
    defaultValue,
    isPressure,
    unit,
  }: {
    idx: number;
    defaultValue: string;
    isPressure: boolean;
    unit: string;
  }) => {
    const kpaRef = useRef<HTMLSpanElement | null>(null);

    const onInput = (e: React.FormEvent<HTMLInputElement>) => {
      if (!isPressure || !kpaRef.current) return;
      const k = kpaFromPsi(e.currentTarget.value);
      if (!showKpaHint) {
        kpaRef.current.textContent = unit;
      } else if (k != null) {
        kpaRef.current.textContent = `${unit} (${k} kPa)`;
      } else {
        kpaRef.current.textContent = `${unit} (— kPa)`;
      }
    };

    // seed inline unit text
    const seed = () => {
      if (!isPressure) return unit;
      const k = kpaFromPsi(defaultValue);
      if (!showKpaHint) return unit;
      return k != null ? `${unit} (${k} kPa)` : `${unit} (— kPa)`;
    };

    return (
      <div className="relative w-full max-w-[11rem]">
        <input
          name={`hyd-${idx}`}
          defaultValue={defaultValue}
          tabIndex={0}
          className="w-full rounded-lg border border-[color:var(--metal-border-soft,#374151)] bg-black/80 px-3 py-1.5 pr-24 text-sm text-white placeholder:text-neutral-500 focus:border-[color:var(--accent-copper,#f97316)] focus:ring-2 focus:ring-[color:var(--accent-copper-soft,#fdba74)]"
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
          ref={kpaRef}
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 whitespace-nowrap text-[11px] text-neutral-400"
        >
          {seed()}
        </span>
      </div>
    );
  };

  const RegionCard = ({
    region,
    rows,
  }: {
    region: Region;
    rows: RowTriplet[];
  }) => (
    <div className="rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/60 p-4 shadow-[0_18px_45px_rgba(0,0,0,0.9)] backdrop-blur-md">
      <div
        className="mb-3 text-lg font-semibold text-[color:var(--accent-copper,#f97316)]"
        style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}
      >
        {region}
      </div>

      <div className="mb-2 grid grid-cols-[1fr_auto_1fr] items-center gap-4 text-xs text-neutral-400">
        <div>Left</div>
        <div className="text-center">Item</div>
        <div className="text-right">Right</div>
      </div>

      {open && (
        <div className="space-y-3">
          {rows.map((row, i) => (
            <div
              key={`${region}-${row.metric}-${i}`}
              className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 rounded-xl bg-black/80 p-3"
            >
              <div>
                {row.left ? (
                  <InputCell
                    idx={row.left.idx}
                    defaultValue={row.left.initial}
                    isPressure={row.left.isPressure}
                    unit={row.left.unit}
                  />
                ) : (
                  <div className="h-[34px]" />
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
                  <InputCell
                    idx={row.right.idx}
                    defaultValue={row.right.initial}
                    isPressure={row.right.isPressure}
                    unit={row.right.unit}
                  />
                ) : (
                  <div className="h-[34px]" />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (!groups.length) return null;

  return (
    <div className="grid gap-3">
      {/* top controls – kPa hint + collapse */}
      <div className="flex items-center justify-end gap-3 px-1">
        <label className="flex select-none items-center gap-2 text-xs text-neutral-400">
          <input
            type="checkbox"
            className="h-3 w-3 accent-[color:var(--accent-copper,#f97316)]"
            checked={showKpaHint}
            onChange={(e) => setShowKpaHint(e.target.checked)}
            tabIndex={-1}
          />
          kPa hint
        </label>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white hover:border-[color:var(--accent-copper,#f97316)] hover:bg-white/10"
          aria-expanded={open}
          title={open ? "Collapse" : "Expand"}
          tabIndex={-1}
        >
          {open ? "Collapse" : "Expand"}
        </button>
      </div>

      <div className="grid gap-4">
        {groups.map((g) => (
          <RegionCard key={g.region} region={g.region} rows={g.rows} />
        ))}
      </div>
    </div>
  );
}