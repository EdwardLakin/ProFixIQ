"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useInspectionForm } from "@inspections/lib/inspection/ui/InspectionFormContext";
import type { InspectionItem } from "@inspections/lib/inspection/types";

type Props = {
  sectionIndex: number;
  items: InspectionItem[];
  /** Optional hint used when a row/unit is blank */
  unitHint?: (label: string) => string;
};

/**
 * CornerGrid (Hydraulic)
 * - Always renders 4 corners: LF, RF, LR, RR (also accepts "Left Front", etc.)
 * - Each corner card contains its metrics (Tire Pressure, Tread, Pad Thickness, Rotor, etc.)
 * - Debounced inputs buffer locally and sync to form state after a short delay.
 */
export default function CornerGrid({ sectionIndex, items, unitHint }: Props) {
  const { updateItem } = useInspectionForm();

  // Accept both abbreviations and full corner names
  type CornerKey = "LF" | "RF" | "LR" | "RR";
  const abbrevRE = /^(?<corner>LF|RF|LR|RR)\s+(?<metric>.+)$/i;
  const fullRE = /^(?<corner>(Left|Right)\s+(Front|Rear))\s+(?<metric>.+)$/i;

  const normalizeCorner = (raw: string): CornerKey | null => {
    const s = raw.toLowerCase();
    if (s.startsWith("lf") || s === "left front") return "LF";
    if (s.startsWith("rf") || s === "right front") return "RF";
    if (s.startsWith("lr") || s === "left rear") return "LR";
    if (s.startsWith("rr") || s === "right rear") return "RR";
    return null;
  };

  type Row = {
    idx: number;
    metric: string;
    labelForHint: string;
    unit?: string | null;
  };

  type CornerGroup = {
    corner: CornerKey;
    rows: Row[];
  };

  // Order metrics in a sensible way for hydraulic checks
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
    const i = metricOrder.findIndex(x => m.toLowerCase().includes(x.toLowerCase()));
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };

  // Group items into the 4 corners
  const groups: CornerGroup[] = useMemo(() => {
    const base: Record<CornerKey, Row[]> = { LF: [], RF: [], LR: [], RR: [] };

    items.forEach((it, idx) => {
      const label = it.item ?? "";
      let corner: CornerKey | null = null;
      let metric = "";

      const m1 = label.match(abbrevRE);
      if (m1?.groups) {
        corner = normalizeCorner(m1.groups.corner);
        metric = m1.groups.metric.trim();
      } else {
        const m2 = label.match(fullRE);
        if (m2?.groups) {
          corner = normalizeCorner(m2.groups.corner);
          metric = m2.groups.metric.trim();
        }
      }
      if (!corner) return;

      base[corner].push({
        idx,
        metric,
        labelForHint: label,
        unit: it.unit ?? (unitHint ? unitHint(label) : ""),
      });
    });

    // Sort rows within each corner
    const build = (corner: CornerKey): CornerGroup => ({
      corner,
      rows: base[corner].sort((a, b) => orderIndex(a.metric) - orderIndex(b.metric)),
    });

    return [build("LF"), build("RF"), build("LR"), build("RR")];
  }, [items, unitHint]);

  /** ------------------------ Debounced input buffer ------------------------ */
  const [localVals, setLocalVals] = useState<Record<number, string>>(() => {
    const init: Record<number, string> = {};
    items.forEach((it, i) => (init[i] = String(it.value ?? "")));
    return init;
  });

  // keep buffer in sync if items list changes externally
  useEffect(() => {
    setLocalVals(prev => {
      const next: Record<number, string> = { ...prev };
      items.forEach((it, i) => {
        const want = String(it.value ?? "");
        if (next[i] !== want) next[i] = want;
      });
      return next;
    });
  }, [items]);

  const timersRef = useRef<Record<number, number | NodeJS.Timeout>>({});

  const setValueDebounced = (itemIdx: number, value: string) => {
    setLocalVals(v => ({ ...v, [itemIdx]: value }));
    const t = timersRef.current[itemIdx];
    if (t) clearTimeout(t as number);

    timersRef.current[itemIdx] = setTimeout(() => {
      updateItem(sectionIndex, itemIdx, { value });
    }, 250);
  };

  /** ------------------------------- UI ------------------------------------ */

  const CornerTitle: Record<CornerKey, string> = {
    LF: "Left Front",
    RF: "Right Front",
    LR: "Left Rear",
    RR: "Right Rear",
  };

  const CornerCard = ({ group }: { group: CornerGroup }) => (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
      <div
        className="mb-2 font-semibold text-orange-400"
        style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}
      >
        {CornerTitle[group.corner]}
      </div>

      <div className="space-y-3">
        {group.rows.map((row) => (
          <div key={`${group.corner}-${row.idx}-${row.metric}`} className="rounded bg-zinc-950/70 p-3">
            <div
              className="mb-2 text-sm font-semibold text-orange-300"
              style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}
            >
              {row.metric}
            </div>

            <div className="grid grid-cols-[1fr_auto] items-center gap-2">
              <input
                className="w-full rounded border border-zinc-800 bg-zinc-800/60 px-2 py-1 text-white"
                style={{ fontFamily: "Roboto, system-ui, sans-serif" }}
                value={localVals[row.idx] ?? ""}
                onChange={(e) => setValueDebounced(row.idx, e.target.value)}
                placeholder="Value"
              />
              <div className="text-center text-xs text-zinc-400">
                {row.unit ?? (unitHint ? unitHint(row.labelForHint) : "")}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // Layout: two cards across for fronts, then rears
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <CornerCard group={groups[0]} /> {/* LF */}
        <CornerCard group={groups[1]} /> {/* RF */}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <CornerCard group={groups[2]} /> {/* LR */}
        <CornerCard group={groups[3]} /> {/* RR */}
      </div>
    </div>
  );
}