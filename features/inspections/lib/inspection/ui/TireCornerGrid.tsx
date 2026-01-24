"use client";

import { useMemo, useState } from "react";
import { useInspectionForm } from "@inspections/lib/inspection/ui/InspectionFormContext";
import type { InspectionItem } from "@inspections/lib/inspection/types";

type Props = {
  sectionIndex: number;
  items: InspectionItem[];
  unitHint?: (label: string) => string;
  onAddAxle?: (axleLabel: string) => void;
  onSpecHint?: (metricLabel: string) => void;
};

type Side = "Left" | "Right";
type DualPos = "Inner" | "Outer";

type MetricKind = "pressure" | "tread" | "other";

type Cell = {
  idx: number;
  label: string;
  unit: string;
  initial: string;
};

type SingleSide = {
  pressure?: Cell;
  tread?: Cell;
};

type DualSide = {
  pressure?: Cell;
  treadOuter?: Cell;
  treadInner?: Cell;
};

type AxleRow = {
  axle: string;
  isDual: boolean;
  single: { left: SingleSide; right: SingleSide };
  dual: { left: DualSide; right: DualSide };
};

/**
 * Supported formats:
 *  - Heavy-duty: "Steer 1 Left Tire Pressure", "Drive 1 Right Tread Depth (Outer)"
 *  - Hydraulic corners: "LF Tire Pressure", "RR Tread Depth", "LR Tread Depth (Inner)"
 */
const AXLE_LABEL_RE = /^(?<axle>.+?)\s+(?<side>Left|Right)\s+(?<metric>.+)$/i;

const HYD_CORNER_RE = /^(?<corner>LF|RF|LR|RR)\s+(?<metric>.+)$/i;
type HydCorner = "LF" | "RF" | "LR" | "RR";

function cornerToAxleSide(corner: HydCorner): { axleLabel: string; side: Side } {
  switch (corner) {
    case "LF":
      return { axleLabel: "Steer 1", side: "Left" };
    case "RF":
      return { axleLabel: "Steer 1", side: "Right" };
    case "LR":
      return { axleLabel: "Rear 1", side: "Left" };
    case "RR":
      return { axleLabel: "Rear 1", side: "Right" };
  }
}

function metricKindFrom(label: string): MetricKind {
  const l = label.toLowerCase();
  if (l.includes("tire pressure") || l.includes("pressure")) return "pressure";
  if (l.includes("tread depth") || l.includes("tread") || l.includes("tire tread")) return "tread";
  return "other";
}

function extractTreadPos(metricLabel: string): DualPos | null {
  const l = metricLabel.toLowerCase();
  if (l.includes("outer")) return "Outer";
  if (l.includes("inner")) return "Inner";
  return null;
}

function pickUnit(explicit: string | null | undefined, hinted: string | null | undefined): string {
  const e = (explicit ?? "").trim();
  if (e) return e;
  return (hinted ?? "").trim();
}

function isDualAxleLabel(axle: string): boolean {
  const l = axle.toLowerCase();
  // Steer is single. Everything else (drive/rear/tag/trailer) is dual.
  if (l.startsWith("steer")) return false;
  if (l.startsWith("drive")) return true;
  if (l.startsWith("rear")) return true;
  if (l.startsWith("tag")) return true;
  if (l.startsWith("trailer")) return true;
  return true; // default to dual for unknown axle types (safe per your “duals on both” note)
}

function placeSingleTread(side: SingleSide, cell: Cell): void {
  if (!side.tread) side.tread = cell;
}

function placeDualTread(side: DualSide, pos: DualPos | null, cell: Cell): void {
  if (pos === "Outer") {
    if (!side.treadOuter) side.treadOuter = cell;
    return;
  }
  if (pos === "Inner") {
    if (!side.treadInner) side.treadInner = cell;
    return;
  }
  // no pos -> fill outer then inner
  if (!side.treadOuter) side.treadOuter = cell;
  else if (!side.treadInner) side.treadInner = cell;
}

export default function TireGrid({ sectionIndex, items, unitHint, onAddAxle }: Props) {
  const { updateItem } = useInspectionForm();
  const [open, setOpen] = useState(true);

  const commit = (idx: number, value: string) => {
    updateItem(sectionIndex, idx, { value });
  };

  const tables = useMemo<AxleRow[]>(() => {
    const byAxle = new Map<string, AxleRow>();

    const ensure = (axle: string): AxleRow => {
      const existing = byAxle.get(axle);
      if (existing) return existing;

      const next: AxleRow = {
        axle,
        isDual: isDualAxleLabel(axle),
        single: { left: {}, right: {} },
        dual: { left: {}, right: {} },
      };
      byAxle.set(axle, next);
      return next;
    };

    items.forEach((it, idx) => {
      const label = String(it.item ?? it.name ?? "").trim();
      if (!label) return;

      const hintedUnit = unitHint ? unitHint(label) : "";

      // 1) Hydraulic corner style: "LF Tire Pressure"
      const hyd = label.match(HYD_CORNER_RE);
      if (hyd?.groups?.corner && hyd.groups.metric) {
        const corner = String(hyd.groups.corner).toUpperCase() as HydCorner;
        const metric = String(hyd.groups.metric).trim();
        const { axleLabel, side } = cornerToAxleSide(corner);

        const kind = metricKindFrom(metric);
        if (kind === "other") return;

        const row = ensure(axleLabel);
        // force: steer single, rear dual
        row.isDual = isDualAxleLabel(axleLabel);

        const cell: Cell = {
          idx,
          label,
          unit: pickUnit(it.unit ?? null, hintedUnit),
          initial: String(it.value ?? ""),
        };

        if (!row.isDual) {
          const grp = side === "Left" ? row.single.left : row.single.right;
          if (kind === "pressure" && !grp.pressure) grp.pressure = cell;
          if (kind === "tread") placeSingleTread(grp, cell);
          return;
        }

        const grp = side === "Left" ? row.dual.left : row.dual.right;
        if (kind === "pressure" && !grp.pressure) grp.pressure = cell;
        if (kind === "tread") placeDualTread(grp, extractTreadPos(metric), cell);
        return;
      }

      // 2) Heavy-duty axle style: "Drive 1 Left Tread Depth (Outer)"
      const m = label.match(AXLE_LABEL_RE);
      if (!m?.groups) return;

      const axle = String(m.groups.axle ?? "").trim();
      const side = (String(m.groups.side ?? "") as Side) || "Left";
      const metric = String(m.groups.metric ?? "").trim();
      if (!axle || !metric) return;

      const kind = metricKindFrom(metric);
      if (kind === "other") return;

      const row = ensure(axle);

      // enforce dual by axle type (per your spec), not by presence of “Inner/Outer”
      row.isDual = isDualAxleLabel(axle);

      const cell: Cell = {
        idx,
        label,
        unit: pickUnit(it.unit ?? null, hintedUnit),
        initial: String(it.value ?? ""),
      };

      if (!row.isDual) {
        const grp = side === "Left" ? row.single.left : row.single.right;
        if (kind === "pressure" && !grp.pressure) grp.pressure = cell;
        if (kind === "tread") placeSingleTread(grp, cell);
        return;
      }

      const grp = side === "Left" ? row.dual.left : row.dual.right;
      if (kind === "pressure" && !grp.pressure) grp.pressure = cell;
      if (kind === "tread") placeDualTread(grp, extractTreadPos(metric), cell);
    });

    const out = Array.from(byAxle.values());

    const score = (ax: string): number => {
      const l = ax.toLowerCase();
      if (l.startsWith("steer")) return 0;
      if (l.startsWith("drive")) return 1;
      if (l.startsWith("rear")) return 2;
      if (l.startsWith("tag")) return 3;
      if (l.startsWith("trailer")) return 4;
      return 9;
    };

    out.sort((a, b) => {
      const sa = score(a.axle);
      const sb = score(b.axle);
      if (sa !== sb) return sa - sb;
      return a.axle.localeCompare(b.axle);
    });

    return out;
  }, [items, unitHint]);

  if (tables.length === 0) return null;

  const existingAxles = tables.map((t) => t.axle);

  return (
    <div className="grid w-full gap-3">
      <div className="flex items-center justify-end gap-3 px-1">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-md border border-slate-600/50 bg-slate-900/40 px-2 py-1 text-xs text-slate-100 hover:border-orange-400/70 hover:bg-slate-900/70"
          aria-expanded={open}
          title={open ? "Collapse" : "Expand"}
          tabIndex={-1}
        >
          {open ? "Collapse" : "Expand"}
        </button>
      </div>

      {onAddAxle ? <AddAxlePicker existing={existingAxles} onAddAxle={onAddAxle} /> : null}

      {tables.map((t) => (
        <div
          key={t.axle}
          className="overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-950/70 shadow-[0_18px_45px_rgba(0,0,0,0.85)] backdrop-blur-xl"
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div
              className="text-base font-semibold uppercase tracking-[0.18em] text-[color:var(--accent-copper,#f97316)]"
              style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}
            >
              {t.axle}
            </div>
          </div>

          {open ? (
            <div className="overflow-x-auto">
              <div className="inline-block min-w-full align-middle">
                <table className="min-w-full border-separate border-spacing-y-1">
                  <thead>
                    <tr className="text-xs text-muted-foreground">
                      <th className="px-3 py-2 text-left text-[11px] font-normal uppercase tracking-[0.16em] text-slate-400">
                        Item
                      </th>
                      <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-100">
                        Left
                      </th>
                      <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-100">
                        Right
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {/* Pressure row */}
                    <tr className="align-middle">
                      <td className="px-3 py-2 text-sm font-semibold text-foreground">
                        Tire Pressure
                      </td>
                      {(["Left", "Right"] as const).map((side) => {
                        const cell =
                          side === "Left"
                            ? (t.isDual ? t.dual.left.pressure : t.single.left.pressure)
                            : (t.isDual ? t.dual.right.pressure : t.single.right.pressure);

                        return (
                          <td key={side} className="px-3 py-2 text-center">
                            {cell ? (
                              <ValueInput cell={cell} placeholder="Value" onCommit={commit} />
                            ) : (
                              <div className="h-[32px]" />
                            )}
                          </td>
                        );
                      })}
                    </tr>

                    {/* Tread rows */}
                    {!t.isDual ? (
                      <tr className="align-middle">
                        <td className="px-3 py-2 text-sm font-semibold text-foreground">
                          Tread Depth
                        </td>
                        {(["Left", "Right"] as const).map((side) => {
                          const cell = side === "Left" ? t.single.left.tread : t.single.right.tread;
                          return (
                            <td key={side} className="px-3 py-2 text-center">
                              {cell ? (
                                <ValueInput cell={cell} placeholder="Value" onCommit={commit} />
                              ) : (
                                <div className="h-[32px]" />
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ) : (
                      <>
                        <tr className="align-middle">
                          <td className="px-3 py-2 text-sm font-semibold text-foreground">
                            Tread Depth (Outer)
                          </td>
                          {(["Left", "Right"] as const).map((side) => {
                            const cell =
                              side === "Left" ? t.dual.left.treadOuter : t.dual.right.treadOuter;
                            return (
                              <td key={side} className="px-3 py-2 text-center">
                                {cell ? (
                                  <ValueInput cell={cell} placeholder="Outer" onCommit={commit} />
                                ) : (
                                  <div className="h-[32px]" />
                                )}
                              </td>
                            );
                          })}
                        </tr>

                        <tr className="align-middle">
                          <td className="px-3 py-2 text-sm font-semibold text-foreground">
                            Tread Depth (Inner)
                          </td>
                          {(["Left", "Right"] as const).map((side) => {
                            const cell =
                              side === "Left" ? t.dual.left.treadInner : t.dual.right.treadInner;
                            return (
                              <td key={side} className="px-3 py-2 text-center">
                                {cell ? (
                                  <ValueInput cell={cell} placeholder="Inner" onCommit={commit} />
                                ) : (
                                  <div className="h-[32px]" />
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ValueInput({
  cell,
  placeholder,
  onCommit,
}: {
  cell: Cell;
  placeholder: string;
  onCommit: (idx: number, value: string) => void;
}) {
  const rightUnit = (cell.unit ?? "").trim();

  return (
    <div className="relative w-full max-w-[9rem]">
      <input
        defaultValue={cell.initial}
        className="w-full rounded-lg border border-slate-700/70 bg-slate-950/70 px-3 py-1.5 pr-14 text-sm text-foreground placeholder:text-slate-500 focus:border-orange-400 focus:ring-2 focus:ring-orange-400"
        placeholder={placeholder}
        autoComplete="off"
        inputMode="decimal"
        onBlur={(e) => onCommit(cell.idx, e.currentTarget.value)}
      />
      {rightUnit ? (
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 whitespace-nowrap text-[11px] text-muted-foreground">
          {rightUnit}
        </span>
      ) : null}
    </div>
  );
}

function AddAxlePicker({
  existing,
  onAddAxle,
}: {
  existing: string[];
  onAddAxle: (axleLabel: string) => void;
}) {
  const [pending, setPending] = useState<string>("");

  const candidates = useMemo(() => {
    const wants: string[] = [];
    for (let i = 1; i <= 2; i++) wants.push(`Steer ${i}`);
    for (let i = 1; i <= 4; i++) wants.push(`Drive ${i}`);
    wants.push("Rear 1");
    wants.push("Tag", "Trailer 1", "Trailer 2", "Trailer 3");
    return wants.filter((l) => !existing.includes(l));
  }, [existing]);

  return (
    <div className="flex items-center gap-2 px-1">
      <select
        className="rounded-full border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 px-3 py-1 text-xs text-neutral-100 shadow-[0_10px_24px_rgba(0,0,0,0.85)] focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/80"
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
        className="rounded-full bg-[linear-gradient(to_right,var(--accent-copper-soft,#e17a3e),var(--accent-copper,#f97316))] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-black shadow-[0_0_18px_rgba(212,118,49,0.6)] hover:brightness-110 disabled:opacity-40"
        onClick={() => {
          if (pending) onAddAxle(pending);
        }}
        disabled={!pending}
        type="button"
      >
        + Add
      </button>
    </div>
  );
}