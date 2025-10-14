"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useInspectionForm } from "@inspections/lib/inspection/ui/InspectionFormContext";
import type { InspectionItem } from "@inspections/lib/inspection/types";

type Props = {
  sectionIndex: number;
  items: InspectionItem[];
  unitHint?: (label: string) => string;
};

export default function CornerGrid({ sectionIndex, items, unitHint }: Props) {
  const { updateItem } = useInspectionForm();

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

  type Row = { idx: number; metric: string; labelForHint: string; unit?: string | null };
  type CornerGroup = { corner: CornerKey; rows: Row[] };

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

    const build = (corner: CornerKey): CornerGroup => ({
      corner,
      rows: base[corner].sort((a, b) => orderIndex(a.metric) - orderIndex(b.metric)),
    });

    return [build("LF"), build("RF"), build("LR"), build("RR")];
  }, [items, unitHint]);

  /* -------- Local buffer with focused guard (no timers) -------- */
  const [localVals, setLocalVals] = useState<Record<number, string>>(() => {
    const init: Record<number, string> = {};
    items.forEach((it, i) => (init[i] = String(it.value ?? "")));
    return init;
  });
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null);

  useEffect(() => {
    setLocalVals((prev) => {
      const next = { ...prev };
      items.forEach((it, i) => {
        if (focusedIdx === i) return;
        const want = String(it.value ?? "");
        if (next[i] !== want) next[i] = want;
      });
      return next;
    });
  }, [items, focusedIdx]);

  const commitValue = (itemIdx: number) => updateItem(sectionIndex, itemIdx, { value: localVals[itemIdx] ?? "" });

  /* ---------------- Header summary + collapse ------------------ */
  const [open, setOpen] = useState(true);

  const filledCounts = useMemo(() => {
    const countFilled = (rows: Row[]) =>
      rows.reduce((acc, r) => (String(localVals[r.idx] ?? "").trim() ? acc + 1 : acc), 0);
    return {
      LF: { filled: countFilled(groups[0]?.rows ?? []), total: groups[0]?.rows.length ?? 0 },
      RF: { filled: countFilled(groups[1]?.rows ?? []), total: groups[1]?.rows.length ?? 0 },
      LR: { filled: countFilled(groups[2]?.rows ?? []), total: groups[2]?.rows.length ?? 0 },
      RR: { filled: countFilled(groups[3]?.rows ?? []), total: groups[3]?.rows.length ?? 0 },
    };
  }, [groups, localVals]);

  const CornerTitle: Record<CornerKey, string> = {
    LF: "Left Front",
    RF: "Right Front",
    LR: "Left Rear",
    RR: "Right Rear",
  };

  /** --------------------------- Row (memo) ---------------------- */
  const RowView = React.memo(function RowView({ row }: { row: Row }) {
    const idx = row.idx;
    const id = `hydro-cell-${idx}`;

    return (
      <div className="rounded bg-zinc-950/70 p-3">
        <div className="flex items-center gap-3">
          <label
            htmlFor={id}
            className="min-w-0 grow truncate text-sm font-semibold text-white"
            style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}
          >
            {row.metric}
          </label>

          <input
            id={id}
            name={id}
            className="w-40 rounded border border-gray-600 bg-black px-2 py-1 text-sm text-white outline-none placeholder:text-zinc-400"
            value={localVals[idx] ?? ""}
            onFocus={() => setFocusedIdx(idx)}
            onChange={(e) => setLocalVals((p) => ({ ...p, [idx]: e.target.value }))}
            onBlur={() => {
              commitValue(idx);
              setFocusedIdx(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
            }}
            placeholder="Value"
            autoComplete="off"
            inputMode="decimal"
            enterKeyHint="done"
          />
          <div className="text-right text-xs text-zinc-400">
            {row.unit ?? (unitHint ? unitHint(row.labelForHint) : "")}
          </div>
        </div>
      </div>
    );
  });

  const CornerCard = ({ group }: { group: CornerGroup }) => (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
      <div
        className="mb-2 font-semibold text-orange-400"
        style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}
      >
        {CornerTitle[group.corner]}
      </div>

      {open && (
        <div className="space-y-3">
          {group.rows.map((row) => (
            <RowView key={row.idx} row={row} />   
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-end gap-3 px-1">
        <div className="hidden text-xs text-zinc-400 md:block" style={{ fontFamily: "Roboto, system-ui, sans-serif" }}>
          LF {filledCounts.LF.filled}/{filledCounts.LF.total} &nbsp;|&nbsp; RF {filledCounts.RF.filled}/{filledCounts.RF.total} &nbsp;|&nbsp; LR {filledCounts.LR.filled}/{filledCounts.LR.total} &nbsp;|&nbsp; RR {filledCounts.RR.filled}/{filledCounts.RR.total}
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded bg-zinc-700 px-2 py-1 text-xs text-white hover:bg-zinc-600"
          aria-expanded={open}
          title={open ? "Collapse" : "Expand"}
        >
          {open ? "Collapse" : "Expand"}
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <CornerCard group={groups[0]} />
        <CornerCard group={groups[1]} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <CornerCard group={groups[2]} />
        <CornerCard group={groups[3]} />
      </div>
    </div>
  );
}