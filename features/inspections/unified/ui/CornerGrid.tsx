"use client";

import React from "react";
import type { InspectionItem } from "@inspections/lib/inspection/types";

type GridUnitMode = "metric" | "imperial";
type Side = "left" | "right";
type Variant = "main" | "inner" | "outer";

interface CornerGridProps {
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
}

interface CornerCell {
  itemIndex: number;
  item: InspectionItem;
}

interface CornerSideInputs {
  main?: CornerCell; // LF / RF / LR / RR
  inner?: CornerCell; // LRI / RRI
  outer?: CornerCell; // LRO / RRO
}

interface CornerRow {
  metricKey: string;
  metricLabel: string;
  left: CornerSideInputs;
  right: CornerSideInputs;
}

interface ParsedHydLocation {
  side: Side;
  variant: Variant;
  metric: string;
  metricBase: string;
}

/**
 * Remove "Inner" / "Outer" markup from a metric to group rows,
 * e.g. "Tire Tread (Outer)" + "Tire Tread (Inner)" → "Tire Tread".
 */
function normaliseMetric(metric: string): string {
  return metric
    .replace(/\(\s*(inner|outer)\s*\)/gi, "")
    .replace(/\b(inner|outer)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Support:
 *  - "LF Tire Pressure"
 *  - "RRI Brake Pad Thickness"
 *  - "Left Front Tire Tread"
 *  - "Right Rear Inner Tire Tread (Outer)"
 */
function parseHydLabel(labelRaw: string): ParsedHydLocation | null {
  const label = labelRaw.trim();
  if (!label) return null;

  // Abbreviated location codes
  const abbrMatch = label.match(
    /^(LF|RF|LR|RR|LRI|LRO|RRI|RRO)\s+(.+)$/i,
  );
  if (abbrMatch) {
    const code = abbrMatch[1].toUpperCase();
    const metric = abbrMatch[2].trim();
    if (!metric) return null;

    const side: Side = code.startsWith("L") ? "left" : "right";
    let variant: Variant = "main";

    if (code.endsWith("I")) variant = "inner";
    if (code.endsWith("O")) variant = "outer";

    const metricBase = normaliseMetric(metric);

    return {
      side,
      variant,
      metric,
      metricBase: metricBase || metric,
    };
  }

  // Full text – e.g. "Left Rear Inner Tire Tread"
  const fullMatch = label.match(
    /^(Left|Right)\s+(Front|Rear)(?:\s+(Inner|Outer))?\s+(.+)$/i,
  );
  if (fullMatch) {
    const side: Side = fullMatch[1].toLowerCase() === "left" ? "left" : "right";
    const innerOuter = (fullMatch[3] ?? "").toLowerCase();
    const metric = fullMatch[4].trim();
    if (!metric) return null;

    let variant: Variant = "main";
    if (innerOuter === "inner") variant = "inner";
    if (innerOuter === "outer") variant = "outer";

    const metricBase = normaliseMetric(metric);

    return {
      side,
      variant,
      metric,
      metricBase: metricBase || metric,
    };
  }

  return null;
}

function buildRows(items: InspectionItem[]): {
  rows: CornerRow[];
  loose: Array<{ itemIndex: number; item: InspectionItem }>;
} {
  const rowsMap = new Map<string, CornerRow>();
  const loose: Array<{ itemIndex: number; item: InspectionItem }> = [];

  items.forEach((item, idx) => {
    const label = item.item ?? item.name ?? "";
    const parsed = parseHydLabel(label);
    if (!parsed) {
      loose.push({ itemIndex: idx, item });
      return;
    }

    const existing =
      rowsMap.get(parsed.metricBase) ??
      ({
        metricKey: parsed.metricBase,
        metricLabel: parsed.metricBase,
        left: {},
        right: {},
      } as CornerRow);

    const cell: CornerCell = { itemIndex: idx, item };

    if (parsed.side === "left") {
      existing.left[parsed.variant] = cell;
    } else {
      existing.right[parsed.variant] = cell;
    }

    rowsMap.set(parsed.metricBase, existing);
  });

  return { rows: Array.from(rowsMap.values()), loose };
}

function getUnitLabel(metricLabel: string, unitMode: GridUnitMode): string {
  const lower = metricLabel.toLowerCase();

  // Pressure is always psi – unit toggle does not affect this.
  if (lower.includes("pressure")) return "psi";

  // Everything else here is a length/thickness-style measurement.
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

interface ValueInputProps {
  value: string | number | null | undefined;
  unit: string;
  showKpaHint?: boolean;
  isPressure?: boolean;
  placeholder?: string;
  onChange: (next: string) => void;
}

const ValueInput: React.FC<ValueInputProps> = ({
  value,
  unit,
  showKpaHint,
  isPressure,
  placeholder = "Value",
  onChange,
}) => {
  const display = value ?? "";

  return (
    <div className="flex items-center gap-2 rounded-xl border border-[color:var(--metal-border-soft)] bg-black/70 px-3 py-1.5 text-xs shadow-[0_10px_25px_rgba(0,0,0,0.9)] backdrop-blur-md">
      <input
        type="number"
        inputMode="decimal"
        className="w-full bg-transparent text-sm text-white placeholder:text-neutral-500 focus:outline-none"
        placeholder={placeholder}
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
  label: string;
  side: CornerSideInputs;
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
  label,
  side,
  sectionIndex,
  unit,
  isPressure,
  showKpaHint,
  alignRight = false,
  onUpdateItem,
}) => {
  const pieces: Array<{ key: string; caption: string; cell: CornerCell }> = [];

  if (side.main) {
    pieces.push({ key: "main", caption: label, cell: side.main });
  }
  if (side.outer) {
    pieces.push({ key: "outer", caption: `${label} Outer`, cell: side.outer });
  }
  if (side.inner) {
    pieces.push({ key: "inner", caption: `${label} Inner`, cell: side.inner });
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

const CornerGrid: React.FC<CornerGridProps> = ({
  title,
  sectionIndex,
  items,
  unitMode,
  showKpaHint,
  onUpdateItem,
}) => {
  const { rows, loose } = buildRows(items);

  if (rows.length === 0 && loose.length === 0) return null;

  return (
    <section className="metal-card rounded-2xl p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-white sm:text-base">
            {title ?? "Measurements (Hydraulic)"}
          </h3>
          <p className="text-[11px] text-neutral-400">
            Corner-based measurements: tire pressure, tread depth, pad / rotor
            thickness. Values only – statuses live in other sections.
          </p>
        </div>
      </div>

      {/* Desktop header */}
      <div className="hidden text-[11px] text-neutral-400 sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] sm:gap-2 sm:border-t sm:border-white/10 sm:pt-3">
        <div className="px-2 py-1">Left</div>
        <div className="px-2 py-1 text-center">Item</div>
        <div className="px-2 py-1 text-right">Right</div>
      </div>

      <div className="space-y-3 pt-1">
        {rows.map((row) => {
          const unit = getUnitLabel(row.metricLabel, unitMode);
          const isPressure = row.metricLabel.toLowerCase().includes("pressure");

          return (
            <div
              key={row.metricKey}
              className="rounded-xl border border-white/10 bg-black/60 p-3 shadow-[0_12px_30px_rgba(0,0,0,0.9)] backdrop-blur-md"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                <SideStack
                  label="Left"
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
                  label="Right"
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

      {loose.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-950/30 p-3 text-[11px] text-amber-100">
          <div className="mb-1 font-semibold tracking-wide">
            Other measurements
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

export default CornerGrid;