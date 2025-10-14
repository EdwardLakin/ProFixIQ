"use client";

import { useMemo, useState } from "react";
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

  const cornerName = (raw: string): CornerKey | null => {
    const s = raw.toLowerCase();
    if (s.startsWith("lf") || s === "left front") return "LF";
    if (s.startsWith("rf") || s === "right front") return "RF";
    if (s.startsWith("lr") || s === "left rear") return "LR";
    if (s.startsWith("rr") || s === "right rear") return "RR";
    return null;
  };

  type Row = { idx: number; metric: string; labelForHint: string; unit?: string | null };
  type Group = { corner: CornerKey; rows: Row[] };

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

  const groups: Group[] = useMemo(() => {
    const base: Record<CornerKey, Row[]> = { LF: [], RF: [], LR: [], RR: [] };

    items.forEach((it, idx) => {
      const label = it.item ?? "";
      let c: CornerKey | null = null;
      let metric = "";

      const m1 = label.match(abbrevRE);
      if (m1?.groups) {
        c = cornerName(m1.groups.corner);
        metric = m1.groups.metric.trim();
      } else {
        const m2 = label.match(fullRE);
        if (m2?.groups) {
          c = cornerName(m2.groups.corner);
          metric = m2.groups.metric.trim();
        }
      }
      if (!c) return;

      base[c].push({
        idx,
        metric,
        labelForHint: label,
        unit: it.unit ?? (unitHint ? unitHint(label) : ""),
      });
    });

    const build = (corner: CornerKey): Group => ({
      corner,
      rows: base[corner].sort((a, b) => orderIndex(a.metric) - orderIndex(b.metric)),
    });

    return [build("LF"), build("RF"), build("LR"), build("RR")];
  }, [items, unitHint]);

  const [open, setOpen] = useState(true);
  const [filledMap, setFilledMap] = useState<Record<number, boolean>>(() => {
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

  const CornerTitle: Record<CornerKey, string> = {
    LF: "Left Front",
    RF: "Right Front",
    LR: "Left Rear",
    RR: "Right Rear",
  };

  const RowView = ({ row }: { row: Row }) => (
    <div className="rounded bg-zinc-950/70 p-3">
      <div className="flex items-center gap-3">
        <div
          className="min-w-0 grow truncate text-sm font-semibold text-white"
          style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}
        >
          {row.metric}
        </div>

        <input
          name={`hyd-${row.idx}`}
          defaultValue={String(items[row.idx]?.value ?? "")}
          className="w-40 rounded border border-gray-600 bg-black px-2 py-1 text-sm text-white outline-none placeholder:text-zinc-400"
          placeholder="Value"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          inputMode="decimal"
          onBlur={(e) => commit(row.idx, e.currentTarget)}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
          }}
        />
        <div className="text-right text-xs text-zinc-400">
          {row.unit ?? (unitHint ? unitHint(row.labelForHint) : "")}
        </div>
      </div>
    </div>
  );

  const CornerCard = ({ group }: { group: Group }) => (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
      <div className="mb-2 font-semibold text-orange-400" style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}>
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

  const tally = (rows: Row[]) => rows.reduce((a, r) => a + (filledMap[r.idx] ? 1 : 0), 0);

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-end gap-3 px-1">
        <div className="hidden text-xs text-zinc-400 md:block" style={{ fontFamily: "Roboto, system-ui, sans-serif" }}>
          {(["LF", "RF", "LR", "RR"] as CornerKey[]).map((k, i) => {
            const g = groups.find((x) => x.corner === k)!;
            const filled = tally(g.rows);
            const total = g.rows.length;
            return (
              <span key={k}>
                {k} {filled}/{total}
                {i < 3 ? "  |  " : ""}
              </span>
            );
          })}
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