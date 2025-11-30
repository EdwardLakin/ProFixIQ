"use client";

import React from "react";
import type { InspectionItem } from "@inspections/lib/inspection/types";

type GridUnitMode = "metric" | "imperial";
type Side = "left" | "right";
type Variant = "main" | "inner" | "outer";

interface AxleGridProps {
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
  onAddAxle?: () => void;
}

interface AxleCell {
  itemIndex: number;
  item: InspectionItem;
}

interface AxleSideInputs {
  main?: AxleCell;
  inner?: AxleCell;
  outer?: AxleCell;
}

interface AxleMetricRow {
  metricKey: string;
  metricLabel: string;
  left: AxleSideInputs;
  right: AxleSideInputs;
}

interface AxleBlock {
  axleName: string;
  rows: AxleMetricRow[];
}

interface ParsedAirLabel {
  axle: string;
  side: Side;
  variant: Variant;
  metric: string;
  metricBase: string;
}

function normaliseMetric(metric: string): string {
  return metric
    .replace(/\(\s*(inner|outer)\s*\)/gi, "")
    .replace(/\b(inner|outer)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Supported label shapes:
 *  - "Steer Left Tire Pressure"
 *  - "Drive 1 Right Inner Tire Tread"
 *  - "Drive 2 LRI Pushrod Travel"
 *  - "Trailer 1 RRO Drum / Rotor Thickness"
 */
function parseAirLabel(labelRaw: string): ParsedAirLabel | null {
  const label = labelRaw.trim();
  if (!label) return null;

  // Abbreviation: "<axle> <code> <metric>"
  const abbrMatch = label.match(
    /^(?<axle>.+?)\s+(?<code>LRI|LRO|RRI|RRO|LF|RF|LR|RR)\s+(?<metric>.+)$/i,
  );
  if (abbrMatch && abbrMatch.groups) {
    const axle = abbrMatch.groups.axle.trim();
    const code = abbrMatch.groups.code.toUpperCase();
    const metric = abbrMatch.groups.metric.trim();
    if (!axle || !metric) return null;

    const side: Side = code.startsWith("L") ? "left" : "right";
    let variant: Variant = "main";
    if (code.endsWith("I")) variant = "inner";
    if (code.endsWith("O")) variant = "outer";

    const metricBase = normaliseMetric(metric);

    return {
      axle,
      side,
      variant,
      metric,
      metricBase: metricBase || metric,
    };
  }

  // Text form: "<axle> Left [Inner|Outer] Metric..."
  const textMatch = label.match(
    /^(?<axle>.+?)\s+(?<side>Left|Right)\s+(?:(?<io>Inner|Outer)\s+)?(?<metric>.+)$/i,
  );
  if (textMatch && textMatch.groups) {
    const axle = textMatch.groups.axle.trim();
    const side: Side =
      textMatch.groups.side.toLowerCase() === "left" ? "left" : "right";
    const ioRaw = (textMatch.groups.io ?? "").toLowerCase();
    const metric = textMatch.groups.metric.trim();
    if (!axle || !metric) return null;

    let variant: Variant = "main";
    if (ioRaw === "inner") variant = "inner";
    if (ioRaw === "outer") variant = "outer";

    const metricBase = normaliseMetric(metric);

    return {
      axle,
      side,
      variant,
      metric,
      metricBase: metricBase || metric,
    };
  }

  return null;
}

function buildAxles(items: InspectionItem[]): {
  axles: AxleBlock[];
  loose: Array<{ itemIndex: number; item: InspectionItem }>;
} {
  const perAxle = new Map<string, Map<string, AxleMetricRow>>();
  const loose: Array<{ itemIndex: number; item: InspectionItem }> = [];

  items.forEach((item, idx) => {
    const label = item.item ?? item.name ?? "";
    const parsed = parseAirLabel(label);
    if (!parsed) {
      loose.push({ itemIndex: idx, item });
      return;
    }

    const axleMap =
      perAxle.get(parsed.axle) ?? new Map<string, AxleMetricRow>();

    const existingRow =
      axleMap.get(parsed.metricBase) ??
      ({
        metricKey: parsed.metricBase,
        metricLabel: parsed.metricBase,
        left: {},
        right: {},
      } as AxleMetricRow);

    const cell: AxleCell = { itemIndex: idx, item };

    if (parsed.side === "left") {
      existingRow.left[parsed.variant] = cell;
    } else {
      existingRow.right[parsed.variant] = cell;
    }

    axleMap.set(parsed.metricBase, existingRow);
    perAxle.set(parsed.axle, axleMap);
  });

  const axles: AxleBlock[] = Array.from(perAxle.entries()).map(
    ([axleName, rowsMap]) => ({
      axleName,
      rows: Array.from(rowsMap.values()),
    }),
  );

  return { axles, loose };
}

function getUnitLabel(metricLabel: string, unitMode: GridUnitMode): string {
  const lower = metricLabel.toLowerCase();

  // Air pressure always psi, regardless of unit toggle.
  if (lower.includes("pressure")) return "psi";

  // Pushrod travel / drum / rotor / shoe thickness etc.
  if (
    lower.includes("tread") ||
    lower.includes("pad") ||
    lower.includes("shoe") ||
    lower.includes("drum") ||
    lower.includes("rotor") ||
    lower.includes("thickness") ||
    lower.includes("pushrod") ||
    lower.includes("push-rod") ||
    lower.includes("push rod")
  ) {
    return unitMode === "metric" ? "mm" : "in";
  }

  return unitMode === "metric" ? "mm" : "in";
}

interface ValueInputProps {
  value: string | number | null | undefined;
  unit: string;
  showKpaHint?: boolean;
  isPressure?: boolean;
  onChange: (next: string) => void;
}

const ValueInput: React.FC<ValueInputProps> = ({
  value,
  unit,
  showKpaHint,
  isPressure,
  onChange,
}) => {
  const display = value ?? "";

  return (
    <div className="flex items-center gap-2 rounded-xl border border-[color:var(--metal-border-soft)] bg-black/70 px-3 py-1.5 text-xs shadow-[0_10px_25px_rgba(0,0,0,0.9)] backdrop-blur-md">
      <input
        type="number"
        inputMode="decimal"
        className="w-full bg-transparent text-sm text-white placeholder:text-neutral-500 focus:outline-none"
        placeholder="Value"
        value={display}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="flex flex-col items-end text-[10px] leading-tight text-neutral-400">
        <span>{unit}</span>
        {isPressure && showKpaHint && (
          <span className="text-[9px] text-neutral-500">kPa hint</span>
        )}
      </div>
    </div>
  );
};

interface SideStackProps {
  sideLabel: string; // "Left" / "Right"
  side: AxleSideInputs;
  sectionIndex: number;
  unit: string;
  isPressure: boolean;
  showKpaHint: boolean;
  alignRight?: boolean;
  onUpdateItem: (
    sectionIndex: number,
    itemIndex: number,
    patch: Partial<InspectionItem>,
  ) => void;
}

const SideStack: React.FC<SideStackProps> = ({
  sideLabel,
  side,
  sectionIndex,
  unit,
  isPressure,
  showKpaHint,
  alignRight = false,
  onUpdateItem,
}) => {
  const pieces: Array<{ key: string; caption: string; cell: AxleCell }> = [];

  if (side.main) {
    pieces.push({ key: "main", caption: sideLabel, cell: side.main });
  }
  if (side.outer) {
    pieces.push({
      key: "outer",
      caption: `${sideLabel} Outer`,
      cell: side.outer,
    });
  }
  if (side.inner) {
    pieces.push({
      key: "inner",
      caption: `${sideLabel} Inner`,
      cell: side.inner,
    });
  }

  if (!pieces.length) return null;

  return (
    <div className="space-y-1 sm:max-w-[40%]">
      {pieces.map(({ key, caption, cell }) => (
        <div key={key} className="space-y-1">
          <div
            className={`text-[11px] font-medium uppercase tracking-[0.18em] text-neutral-400 ${
              alignRight ? "text-right" : ""
            }`}
          >
            {caption}
          </div>
          <ValueInput
            value={cell.item.value}
            unit={unit}
            isPressure={isPressure}
            showKpaHint={isPressure && showKpaHint}
            onChange={(next) =>
              onUpdateItem(sectionIndex, cell.itemIndex, { value: next })
            }
          />
        </div>
      ))}
    </div>
  );
};

const AxleGrid: React.FC<AxleGridProps> = ({
  title,
  sectionIndex,
  items,
  unitMode,
  showKpaHint,
  onUpdateItem,
  onAddAxle,
}) => {
  const { axles, loose } = buildAxles(items);

  if (axles.length === 0 && loose.length === 0) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-white sm:text-base">
            {title ?? "Axle Measurements (Air Brake)"}
          </h3>
          <p className="text-[11px] text-neutral-400">
            Steer, drive, and trailer axles – tire pressure, tread depth,
            push-rod travel, drum/rotor, pads/shoes. Values only.
          </p>
        </div>
        {onAddAxle && (
          <button
            type="button"
            onClick={onAddAxle}
            className="rounded-full bg-[color:var(--accent-copper)] px-3 py-1.5 text-[11px] font-semibold text-black shadow-[0_0_20px_rgba(193,102,59,0.75)] hover:bg-[color:var(--accent-copper-soft)]"
          >
            + Add axle
          </button>
        )}
      </div>

      <div className="space-y-4">
        {axles.map((axle) => (
          <div
            key={axle.axleName}
            className="metal-card rounded-2xl p-4 shadow-[0_18px_45px_rgba(0,0,0,0.9)]"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
                {axle.axleName}
              </div>
            </div>

            {/* Desktop header */}
            <div className="hidden text-[11px] text-neutral-400 sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] sm:gap-2 sm:border-t sm:border-white/10 sm:pt-2">
              <div className="px-2 py-1">Left</div>
              <div className="px-2 py-1 text-center">Item</div>
              <div className="px-2 py-1 text-right">Right</div>
            </div>

            <div className="space-y-3 pt-1">
              {axle.rows.map((row) => {
                const unit = getUnitLabel(row.metricLabel, unitMode);
                const isPressure =
                  row.metricLabel.toLowerCase().includes("pressure");

                return (
                  <div
                    key={row.metricKey}
                    className="rounded-xl border border-white/10 bg-black/65 p-3 backdrop-blur-md"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                      <SideStack
                        sideLabel="Left"
                        side={row.left}
                        sectionIndex={sectionIndex}
                        unit={unit}
                        isPressure={isPressure}
                        showKpaHint={showKpaHint}
                        onUpdateItem={onUpdateItem}
                      />

                      <div className="flex-1 text-center text-sm font-medium text-neutral-100">
                        {row.metricLabel}
                      </div>

                      <SideStack
                        sideLabel="Right"
                        side={row.right}
                        sectionIndex={sectionIndex}
                        unit={unit}
                        isPressure={isPressure}
                        showKpaHint={showKpaHint}
                        alignRight
                        onUpdateItem={onUpdateItem}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {loose.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-950/30 p-3 text-[11px] text-amber-100">
          <div className="mb-1 font-semibold tracking-wide">
            Other axle measurements
          </div>
          <div className="space-y-2">
            {loose.map(({ item, itemIndex }) => {
              const label = item.item ?? item.name ?? "Item";
              const unit = getUnitLabel(label, unitMode);
              const isPressure = label.toLowerCase().includes("pressure");

              return (
                <div key={itemIndex} className="space-y-1">
                  <div className="text-[11px] text-amber-100/80">
                    {label}
                  </div>
                  <ValueInput
                    value={item.value}
                    unit={unit}
                    isPressure={isPressure}
                    showKpaHint={showKpaHint}
                    onChange={(next) =>
                      onUpdateItem(sectionIndex, itemIndex, { value: next })
                    }
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
};

export default AxleGrid;