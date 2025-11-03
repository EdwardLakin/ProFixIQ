"use client";

import { useMemo, useRef, useState } from "react";
import { useInspectionForm } from "@inspections/lib/inspection/ui/InspectionFormContext";
import type { InspectionItem } from "@inspections/lib/inspection/types";

type Props = {
  sectionIndex: number;
  items: InspectionItem[];
  /** Optional unit resolver when an item has no `unit` */
  unitHint?: (label: string) => string;
  /** Only shown (and used) for AIR mode */
  onAddAxle?: (axleLabel: string) => void;
};

/* ---------------------------- shared helpers ---------------------------- */

const AIR_RE = /^(?<axle>.+?)\s+(?<side>Left|Right)\s+(?<metric>.+)$/i;
const HYD_ABBR_RE = /^(?<corner>LF|RF|LR|RR)\s+(?<metric>.+)$/i;
const HYD_FULL_RE = /^(?<corner>(Left|Right)\s+(Front|Rear))\s+(?<metric>.+)$/i;

type Side = "Left" | "Right";
type Region = "Front" | "Rear";
type CornerKey = "LF" | "RF" | "LR" | "RR";

const cornerToRegion: Record<CornerKey, { side: Side; region: Region }> = {
  LF: { side: "Left", region: "Front" },
  RF: { side: "Right", region: "Front" },
  LR: { side: "Left", region: "Rear" },
  RR: { side: "Right", region: "Rear" },
};

const normalizeCorner = (raw: string): CornerKey | null => {
  const s = raw.toLowerCase();
  if (s.startsWith("lf") || s === "left front") return "LF";
  if (s.startsWith("rf") || s === "right front") return "RF";
  if (s.startsWith("lr") || s === "left rear") return "LR";
  if (s.startsWith("rr") || s === "right rear") return "RR";
  return null;
};

const metricOrderHyd = [
  "Tire Pressure",
  "Tire Tread",
  "Brake Pad",
  "Rotor",
  "Rotor Condition",
  "Rotor Thickness",
  "Wheel Torque",
];
const hydOrderIndex = (m: string) => {
  const i = metricOrderHyd.findIndex((x) => m.toLowerCase().includes(x.toLowerCase()));
  return i === -1 ? Number.MAX_SAFE_INTEGER : i;
};

const metricOrderAir = [
  "Tire Pressure (Outer)",
  "Tire Pressure (Inner)",
  "Tread Depth (Outer)",
  "Tread Depth (Inner)",
  "Tire Pressure",
  "Tread Depth",
  "Lining/Shoe",
  "Drum/Rotor",
  "Push Rod Travel",
  "Wheel Torque Inner",
  "Wheel Torque Outer",
];
const airOrderIndex = (m: string) => {
  const i = metricOrderAir.findIndex((x) => m.toLowerCase().includes(x.toLowerCase()));
  return i === -1 ? Number.MAX_SAFE_INTEGER : i;
};

const isPressure = (label: string) => /pressure/i.test(label);
const kpaFromPsi = (psiStr: string) => {
  const n = Number(psiStr);
  return isFinite(n) ? Math.round(n * 6.894757) : null;
};

/* ---------------------------- component ---------------------------- */

export default function AxlesCornerGrid({ sectionIndex, items, unitHint, onAddAxle }: Props) {
  const { updateItem } = useInspectionForm();

  // Detect mode from the item labels
  const mode: "air" | "hyd" = useMemo(() => {
    for (const it of items) {
      const label = it.item ?? "";
      if (AIR_RE.test(label)) return "air";
      if (HYD_ABBR_RE.test(label) || HYD_FULL_RE.test(label)) return "hyd";
    }
    // Default to HYD so techs at least get LF/RF/LR/RR slots
    return "hyd";
  }, [items]);

  /* ------------------------------------------------------------------ */
  /* HYDRAULIC (LF/RF/LR/RR) — match your CornerGrid layout             */
  /* ------------------------------------------------------------------ */

  type HydCell = {
    idx: number;
    metric: string;
    unit: string;
    fullLabel: string;
    isPressure: boolean;
    initial: string;
  };
  type HydRow = { metric: string; left?: HydCell; right?: HydCell };
  const hydGroups = useMemo(() => {
    if (mode !== "hyd") return [] as Array<{ region: Region; rows: HydRow[] }>;

    const byRegion = new Map<Region, Map<string, HydRow>>();
    const ensureRegion = (r: Region) => byRegion.get(r) ?? byRegion.set(r, new Map()).get(r)!;

    items.forEach((it, idx) => {
      const label = it.item ?? "";
      let ck: CornerKey | null = null;
      let metric = "";

      const m1 = label.match(HYD_ABBR_RE);
      if (m1?.groups) {
        ck = normalizeCorner(m1.groups.corner);
        metric = m1.groups.metric.trim();
      } else {
        const m2 = label.match(HYD_FULL_RE);
        if (m2?.groups) {
          ck = normalizeCorner(m2.groups.corner);
          metric = m2.groups.metric.trim();
        }
      }
      if (!ck) return;

      const { side, region } = cornerToRegion[ck];
      const reg = ensureRegion(region);

      const key = metric.toLowerCase();
      if (!reg.has(key)) reg.set(key, { metric });

      const unit =
        (it.unit ?? "") || (unitHint ? unitHint(label) : "") || "";
      const cell: HydCell = {
        idx,
        metric,
        unit,
        fullLabel: label,
        isPressure: isPressure(metric),
        initial: String(it.value ?? ""),
      };

      const row = reg.get(key)!;
      if (side === "Left") row.left = cell;
      else row.right = cell;
    });

    const out: Array<{ region: Region; rows: HydRow[] }> = [];
    (["Front", "Rear"] as Region[]).forEach((region) => {
      const reg = byRegion.get(region);
      if (!reg) return;
      const rows = Array.from(reg.values()).sort((a, b) => hydOrderIndex(a.metric) - hydOrderIndex(b.metric));
      out.push({ region, rows });
    });
    return out;
  }, [items, unitHint, mode]);

  /* ------------------------------------------------------------------ */
  /* AIR (Steer / Drive / Trailer … Left | Item | Right)                */
  /* ------------------------------------------------------------------ */

  type AirCell = {
    metric: string;
    idx: number;
    unit: string;
    fullLabel: string;
    isPressure: boolean;
    initial: string;
  };
  type AirGroup = { axle: string; left: AirCell[]; right: AirCell[] };
  type AirRow = { metric: string; left?: AirCell; right?: AirCell };

  const isDualAxle = (axle: string) => {
    const a = axle.toLowerCase();
    if (a.startsWith("drive") || a.startsWith("trailer") || a.includes("rear")) return true;
    if (a.startsWith("tag") || a.startsWith("steer")) return false;
    return false;
  };
  const isDualizable = (metric: string) => /tire\s*pressure/i.test(metric) || /tread\s*depth/i.test(metric);
  const hasInnerOuter = (m: string) => /(inner|outer)/i.test(m);

  function expandDuals(axle: string, cells: AirCell[]): AirCell[] {
    if (!isDualAxle(axle)) return cells;
    const out: AirCell[] = [];
    for (const c of cells) {
      if (isDualizable(c.metric) && !hasInnerOuter(c.metric)) {
        const base = c.metric.replace(/\s*\((inner|outer)\)\s*/i, "").trim();
        out.push({ ...c, metric: `${base} (Outer)` });
        out.push({ ...c, metric: `${base} (Inner)` });
      } else {
        out.push(c);
      }
    }
    return out;
  }

  const airGroups = useMemo(() => {
    if (mode !== "air") return [] as AirGroup[];

    const byAxle = new Map<string, { Left: AirCell[]; Right: AirCell[] }>();

    items.forEach((it, idx) => {
      const label = it.item ?? "";
      const m = label.match(AIR_RE);
      if (!m?.groups) return;

      const axle = m.groups.axle.trim();
      const side = (m.groups.side as Side) || "Left";
      const metric = m.groups.metric.trim();

      if (!byAxle.has(axle)) byAxle.set(axle, { Left: [], Right: [] });

      const unit = (it.unit ?? "") || (unitHint ? unitHint(label) : "");
      const cell: AirCell = {
        metric,
        idx,
        unit,
        fullLabel: label,
        isPressure: isPressure(metric),
        initial: String(it.value ?? ""),
      };

      byAxle.get(axle)![side].push(cell);
    });

    return Array.from(byAxle.entries()).map(([axle, sides]) => {
      const left = expandDuals(axle, sides.Left).sort((a, b) => airOrderIndex(a.metric) - airOrderIndex(b.metric));
      const right = expandDuals(axle, sides.Right).sort((a, b) => airOrderIndex(a.metric) - airOrderIndex(b.metric));
      return { axle, left, right };
    });
  }, [items, unitHint, mode]);

  /* ---------------------------- UI Toggles ---------------------------- */

  const [open, setOpen] = useState(true);
  const [showKpa, setShowKpa] = useState(true);

  // track “filled” state only on commit (matches your other grids)
  const [filledMap, setFilledMap] = useState<Record<number, boolean>>(() => {
    const m: Record<number, boolean> = {};
    items.forEach((it, i) => (m[i] = !!String(it.value ?? "").trim()));
    return m;
  });
  const commit = (idx: number, el: HTMLInputElement | null) => {
    if (!el) return;
    const value = el.value;
    updateItem(sectionIndex, idx, { value });
    setFilledMap((p) => (p[idx] === !!value.trim() ? p : { ...p, [idx]: !!value.trim() }));
  };

  /* ------------------- small input used by both modes ------------------ */

  const InputWithInlineUnit = ({
    idx,
    isPressureRow,
    unit,
    defaultValue,
  }: {
    idx: number;
    isPressureRow: boolean;
    unit: string;
    defaultValue: string;
  }) => {
    const spanRef = useRef<HTMLSpanElement | null>(null);
    const seedText = () => {
      if (!isPressureRow) return unit;
      const k = kpaFromPsi(defaultValue);
      return showKpa ? `psi (${k ?? "—"} kPa)` : "psi";
    };
    const onInput = (e: React.FormEvent<HTMLInputElement>) => {
      if (!isPressureRow || !spanRef.current) return;
      const k = kpaFromPsi(e.currentTarget.value);
      spanRef.current.textContent = showKpa ? `psi (${k ?? "—"} kPa)` : "psi";
    };
    return (
      <div className="relative w-40">
        <input
          defaultValue={defaultValue}
          className="w-full rounded border border-gray-600 bg-black px-2 py-1 pr-16 text-sm text-white outline-none placeholder:text-zinc-400"
          placeholder="Value"
          autoComplete="off"
          inputMode="decimal"
          onInput={onInput}
          onBlur={(e) => commit(idx, e.currentTarget)}
          onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
        />
        <span
          ref={spanRef}
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 whitespace-nowrap text-[11px] text-zinc-400"
        >
          {seedText()}
        </span>
      </div>
    );
  };

  /* ---------------------------- HYD RENDER ---------------------------- */

  const HydRegionCard = ({ region, rows }: { region: Region; rows: HydRow[] }) => {
    // sequential tab order Left→Right, top→bottom like your CornerGrid
    let nextTab = 1;

    return (
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
                <div>
                  {row.left ? (
                    <div tabIndex={nextTab++}>
                      <InputWithInlineUnit
                        idx={row.left.idx}
                        isPressureRow={row.left.isPressure}
                        unit={row.left.unit}
                        defaultValue={row.left.initial}
                      />
                    </div>
                  ) : (
                    <div className="h-[30px]" />
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
                    <div tabIndex={nextTab++}>
                      <InputWithInlineUnit
                        idx={row.right.idx}
                        isPressureRow={row.right.isPressure}
                        unit={row.right.unit}
                        defaultValue={row.right.initial}
                      />
                    </div>
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
  };

  /* ----------------------------- AIR RENDER --------------------------- */

  const AirAxleCard = ({ axle, rows }: { axle: string; rows: AirRow[] }) => {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
        <div
          className="mb-3 text-lg font-semibold text-orange-400"
          style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}
        >
          {axle}
        </div>

        <div className="mb-2 grid grid-cols-[1fr_auto_1fr] items-center gap-4 text-xs text-zinc-400">
          <div>Left</div>
          <div className="text-center">Item</div>
          <div className="text-right">Right</div>
        </div>

        {open && (
          <div className="space-y-3">
            {rows.map((row, i) => {
              return (
                <div
                  key={`${axle}-${row.metric}-${i}`}
                  className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 rounded bg-zinc-950/70 p-3"
                >
                  <div>
                    {row.left ? (
                      <InputWithInlineUnit
                        idx={row.left.idx}
                        isPressureRow={row.left.isPressure}
                        unit={row.left.unit}
                        defaultValue={row.left.initial}
                      />
                    ) : (
                      <div className="h-[30px]" />
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
                      <InputWithInlineUnit
                        idx={row.right.idx}
                        isPressureRow={row.right.isPressure}
                        unit={row.right.unit}
                        defaultValue={row.right.initial}
                      />
                    ) : (
                      <div className="h-[30px]" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // build rows for AIR like your AirCornerGrid
  const airRowsPerAxle: Array<{ axle: string; rows: AirRow[] }> = useMemo(() => {
    if (mode !== "air") return [];
    const rows: Array<{ axle: string; rows: AirRow[] }> = [];

    for (const g of airGroups) {
      const map = new Map<string, AirRow>();
      const add = (c: AirCell, which: "left" | "right") => {
        const k = c.metric.toLowerCase();
        const existing = map.get(k) || { metric: c.metric };
        map.set(k, { ...existing, metric: c.metric, [which]: c } as AirRow);
      };
      g.left.forEach((c) => add(c, "left"));
      g.right.forEach((c) => add(c, "right"));
      const merged = Array.from(map.values()).sort((a, b) => airOrderIndex(a.metric) - airOrderIndex(b.metric));
      rows.push({ axle: g.axle, rows: merged });
    }
    return rows;
  }, [airGroups, mode]);

  const countFilled = (cells: Array<{ idx: number }>) =>
    cells.reduce((sum, c) => sum + (filledMap[c.idx] ? 1 : 0), 0);

  /* ------------------------------- render ------------------------------ */

  return (
    <div className="grid gap-3">
      {/* top toolbar matches your other grids */}
      <div className="flex items-center justify-between gap-3 px-1">
        {/* progress strip for AIR mode */}
        {mode === "air" ? (
          <div
            className="hidden text-xs text-zinc-400 md:block"
            style={{ fontFamily: "Roboto, system-ui, sans-serif" }}
          >
            {airGroups.map((g, i) => {
              const filled =
                countFilled(g.left) + countFilled(g.right);
              const total = g.left.length + g.right.length;
              return (
                <span key={g.axle}>
                  {g.axle} {filled}/{total}
                  {i < airGroups.length - 1 ? "  |  " : ""}
                </span>
              );
            })}
          </div>
        ) : (
          <div />
        )}

        <div className="flex items-center gap-3">
          <label className="flex select-none items-center gap-2 text-xs text-zinc-300">
            <input
              type="checkbox"
              className="h-3 w-3 accent-orange-500"
              checked={showKpa}
              onChange={(e) => setShowKpa(e.target.checked)}
            />
            kPa hint
          </label>

          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded bg-zinc-700 px-2 py-1 text-xs text-white hover:bg-zinc-600"
            title={open ? "Collapse" : "Expand"}
          >
            {open ? "Collapse" : "Expand"}
          </button>
        </div>
      </div>

      {/* inline axle picker only for AIR and when provided */}
      {mode === "air" && onAddAxle && (
        <AddAxlePicker
          existingAxles={airGroups.map((g) => g.axle)}
          onAddAxle={onAddAxle}
        />
      )}

      {mode === "hyd" ? (
        <div className="grid gap-4">
          {hydGroups.map((g) => (
            <HydRegionCard key={g.region} region={g.region} rows={g.rows} />
          ))}
        </div>
      ) : (
        <>
          {airRowsPerAxle.map(({ axle, rows }) => (
            <AirAxleCard key={axle} axle={axle} rows={rows} />
          ))}
        </>
      )}
    </div>
  );
}

/* -------------------------- Add Axle (AIR only) -------------------------- */

function AddAxlePicker({
  existingAxles,
  onAddAxle,
}: {
  existingAxles: string[];
  onAddAxle: (axleLabel: string) => void;
}) {
  const [pending, setPending] = useState<string>("");

  const candidates = useMemo(() => {
    const wants: string[] = [];
    for (let i = 1; i <= 2; i++) wants.push(`Steer ${i}`);
    for (let i = 1; i <= 4; i++) wants.push(`Drive ${i}`);
    wants.push("Tag", "Trailer 1", "Trailer 2", "Trailer 3");
    return wants.filter((l) => !existingAxles.includes(l));
  }, [existingAxles]);

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
