// features/inspections/lib/inspection/ui/AxlesCornerGrid.tsx
"use client";

import {
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useInspectionForm } from "@inspections/lib/inspection/ui/InspectionFormContext";
import type { InspectionItem } from "@inspections/lib/inspection/types";

type Props = {
  sectionIndex: number;
  items: InspectionItem[];
  /** Optional unit resolver when an item has no unit */
  unitHint?: (label: string) => string;
  /** Only shown (and used) for AIR mode */
  onAddAxle?: (axleLabel: string) => void;

  /** Optional external collapse control (for sticky header) */
  collapsed?: boolean;
  onToggleCollapse?: () => void;
};

/* ---------------------------- shared helpers ---------------------------- */

const AIR_RE = /^(?<axle>.+?)\s+(?<side>Left|Right)\s+(?<metric>.+)$/i;
const HYD_ABBR_RE = /^(?<corner>LF|RF|LR|RR)\s+(?<metric>.+)$/i;
const HYD_FULL_RE =
  /^(?<corner>(Left|Right)\s+(Front|Rear))\s+(?<metric>.+)$/i;

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

const isPressureMetric = (label: string) => /pressure/i.test(label);
const kpaFromPsi = (psiStr: string) => {
  const n = Number(psiStr);
  return Number.isFinite(n) ? Math.round(n * 6.894757) : null;
};

/* --------------------- strict ordering for AIR --------------------- */
const airPriority = (metric: string): [number, number] => {
  const m = metric.toLowerCase();

  if (/tire\s*pressure/i.test(m)) {
    const second = /outer/i.test(m) ? 0 : /inner/i.test(m) ? 1 : 0;
    return [0, second];
  }
  if (/(tire\s*)?tread\s*depth|tire\s*tread/i.test(m)) {
    const second = /outer/i.test(m) ? 0 : /inner/i.test(m) ? 1 : 0;
    return [1, second];
  }
  if (/(lining|shoe|pad)/i.test(m)) return [2, 0];
  if (/(drum|rotor)/i.test(m)) return [3, 0];
  if (/push\s*rod/i.test(m)) return [4, 0];
  if (/wheel\s*torque/i.test(m)) return [5, /inner/i.test(m) ? 1 : 0];
  return [99, 0];
};
const airCompare = (a: string, b: string) => {
  const [pa, sa] = airPriority(a);
  const [pb, sb] = airPriority(b);
  return pa !== pb ? pa - pb : sa - sb;
};

/* ---------------------- ordering for HYD ---------------------- */
const hydMetricOrder = [
  "Tire Pressure",
  "Tire Tread",
  "Brake Pad",
  "Rotor",
  "Rotor Condition",
  "Rotor Thickness",
  "Wheel Torque",
];
const hydCompare = (a: string, b: string) => {
  const ai = hydMetricOrder.findIndex((x) =>
    a.toLowerCase().includes(x.toLowerCase()),
  );
  const bi = hydMetricOrder.findIndex((x) =>
    b.toLowerCase().includes(x.toLowerCase()),
  );
  const A = ai === -1 ? Number.MAX_SAFE_INTEGER : ai;
  const B = bi === -1 ? Number.MAX_SAFE_INTEGER : bi;
  return A - B;
};

export default function AxlesCornerGrid({
  sectionIndex,
  items,
  unitHint,
  onAddAxle,
  collapsed,
  onToggleCollapse,
}: Props) {
  const { updateItem } = useInspectionForm();

  // Detect mode from the item labels
  const mode: "air" | "hyd" = useMemo(() => {
    for (const it of items) {
      const label = it.item ?? "";
      if (AIR_RE.test(label)) return "air";
      if (HYD_ABBR_RE.test(label) || HYD_FULL_RE.test(label)) return "hyd";
    }
    return "hyd"; // safe default
  }, [items]);

  // Local vs controlled collapse
  const [internalOpen, setInternalOpen] = useState(true);
  const isControlled = typeof collapsed === "boolean";
  const open = isControlled ? !collapsed : internalOpen;

  const toggleOpen = () => {
    onToggleCollapse?.();
    if (!isControlled) {
      setInternalOpen((v) => !v);
    }
  };

  /* ------------------------------------------------------------------ */
  /* HYDRAULIC (LF/RF/LR/RR)                                           */
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
    const ensureRegion = (r: Region) =>
      byRegion.get(r) ?? byRegion.set(r, new Map()).get(r)!;

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
        isPressure: isPressureMetric(metric),
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
      const rows = Array.from(reg.values()).sort((a, b) =>
        hydCompare(a.metric, b.metric),
      );
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
    if (a.startsWith("drive") || a.startsWith("trailer") || a.includes("rear"))
      return true;
    if (a.startsWith("tag") || a.startsWith("steer")) return false;
    return false;
  };

  const isDualizable = (metric: string) =>
    /tire\s*pressure/i.test(metric) ||
    /(tire\s*)?tread\s*depth|tire\s*tread/i.test(metric);
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

      const unit =
        (it.unit ?? "") || (unitHint ? unitHint(label) : "") || "";
      const cell: AirCell = {
        metric,
        idx,
        unit,
        fullLabel: label,
        isPressure: isPressureMetric(metric),
        initial: String(it.value ?? ""),
      };

      byAxle.get(axle)![side].push(cell);
    });

    return Array.from(byAxle.entries()).map(([axle, sides]) => {
      const left = expandDuals(axle, sides.Left).sort((a, b) =>
        airCompare(a.metric, b.metric),
      );
      const right = expandDuals(axle, sides.Right).sort((a, b) =>
        airCompare(a.metric, b.metric),
      );
      return { axle, left, right };
    });
  }, [items, unitHint, mode]);

  // build rows for AIR like AirCornerGrid (merge left/right by metric)
  const airRowsPerAxle: Array<{ axle: string; rows: AirRow[] }> = useMemo(
    () => {
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
        const merged = Array.from(map.values()).sort((a, b) =>
          airCompare(a.metric, b.metric),
        );
        rows.push({ axle: g.axle, rows: merged });
      }
      return rows;
    },
    [airGroups, mode],
  );

  /* ---------------------------- UI state ---------------------------- */

  const [showKpa, setShowKpa] = useState(true);
  const [filledMap, setFilledMap] = useState<Record<number, boolean>>(() => {
    const m: Record<number, boolean> = {};
    items.forEach((it, i) => (m[i] = !!String(it.value ?? "").trim()));
    return m;
  });

  const commit = (idx: number, el: HTMLInputElement | null) => {
    if (!el) return;
    const value = el.value;
    updateItem(sectionIndex, idx, { value });
    setFilledMap((p) =>
      p[idx] === !!value.trim() ? p : { ...p, [idx]: !!value.trim() },
    );
  };

  /* ------------------- shared input used by both modes ------------------ */

  const InputWithInlineUnit = ({
    idx,
    isPressureRow,
    unit,
    defaultValue,
    inputRef,
    onKeyDown,
  }: {
    idx: number;
    isPressureRow: boolean;
    unit: string;
    defaultValue: string;
    inputRef?: (el: HTMLInputElement | null) => void;
    onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  }) => {
    const spanRef = useRef<HTMLSpanElement | null>(null);

    const seedText = () => {
      if (!isPressureRow) return unit;
      const k = kpaFromPsi(defaultValue);
      if (!showKpa) return "psi";
      return k != null ? `psi (${k} kPa)` : "psi (— kPa)";
    };

    const onInput = (e: React.FormEvent<HTMLInputElement>) => {
      if (!isPressureRow || !spanRef.current) return;
      const k = kpaFromPsi(e.currentTarget.value);
      if (!showKpa) {
        spanRef.current.textContent = "psi";
      } else if (k != null) {
        spanRef.current.textContent = `psi (${k} kPa)`;
      } else {
        spanRef.current.textContent = "psi (— kPa)";
      }
    };

    return (
      <div className="relative w-full max-w-[11rem]">
        <input
          ref={inputRef}
          defaultValue={defaultValue}
          className="w-full rounded-xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/80 px-3 py-1.5 pr-20 text-sm text-white placeholder:text-neutral-500 shadow-[0_10px_25px_rgba(0,0,0,0.85)] focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/80"
          placeholder="Value"
          autoComplete="off"
          inputMode="decimal"
          onInput={onInput}
          onBlur={(e) => commit(idx, e.currentTarget)}
          onKeyDown={onKeyDown}
        />
        <span
          ref={spanRef}
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 whitespace-nowrap text-[11px] text-neutral-400"
        >
          {seedText()}
        </span>
      </div>
    );
  };

  /* ---------------------------- HYD UI ---------------------------- */

  const HydRegionCard = ({
    region,
    rows,
  }: {
    region: Region;
    rows: HydRow[];
  }) => {
    // refs[rowIndex][colIndex] where colIndex 0 = Left, 1 = Right
    const inputRefs = useRef<(HTMLInputElement | null)[][]>([]);

    const ensureRow = (rowIndex: number) => {
      if (!inputRefs.current[rowIndex]) {
        inputRefs.current[rowIndex] = [];
      }
      return inputRefs.current[rowIndex];
    };

    const handleKeyDown =
      (rowIndex: number, colIndex: 0 | 1) =>
      (e: KeyboardEvent<HTMLInputElement>) => {
        const refs = inputRefs.current;
        if (!refs.length) return;

        const maxRow = refs.length - 1;

        const focusCell = (r: number, c: 0 | 1) => {
          const row = refs[r];
          if (!row) return;
          const next = row[c];
          if (next) {
            e.preventDefault();
            next.focus();
            next.select?.();
          }
        };

        switch (e.key) {
          case "ArrowRight": {
            if (colIndex === 0) {
              focusCell(rowIndex, 1);
            }
            break;
          }
          case "ArrowLeft": {
            if (colIndex === 1) {
              focusCell(rowIndex, 0);
            }
            break;
          }
          case "ArrowDown": {
            const nextRow = Math.min(maxRow, rowIndex + 1);
            focusCell(nextRow, colIndex);
            break;
          }
          case "ArrowUp": {
            const prevRow = Math.max(0, rowIndex - 1);
            focusCell(prevRow, colIndex);
            break;
          }
          default:
            break;
        }
      };

    return (
      <div className="rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/55 p-4 shadow-[0_18px_45px_rgba(0,0,0,0.9)] backdrop-blur-xl">
        <div
          className="mb-3 text-lg font-semibold uppercase tracking-[0.18em] text-[color:var(--accent-copper,#f97316)]"
          style={{ fontFamily: "var(--font-blackops), system-ui" }}
        >
          {region}
        </div>

        <div className="mb-2 grid grid-cols-[1fr_auto_1fr] items-center gap-4 text-[11px] uppercase tracking-[0.16em] text-neutral-500">
          <div>Left</div>
          <div className="text-center">Item</div>
          <div className="text-right">Right</div>
        </div>

        {open && (
          <div className="space-y-3">
            {rows.map((row, i) => (
              <div
                key={`${region}-${row.metric}-${i}`}
                className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 rounded-xl border border-slate-800/80 bg-neutral-950/80 p-3 shadow-[0_14px_35px_rgba(0,0,0,0.9)]"
              >
                <div>
                  {row.left ? (
                    <InputWithInlineUnit
                      idx={row.left.idx}
                      isPressureRow={row.left.isPressure}
                      unit={row.left.unit}
                      defaultValue={row.left.initial}
                      inputRef={(el) => {
                        const rowRef = ensureRow(i);
                        rowRef[0] = el;
                      }}
                      onKeyDown={handleKeyDown(i, 0)}
                    />
                  ) : (
                    <div className="h-[34px]" />
                  )}
                </div>

                <div
                  className="min-w-0 truncate text-center text-sm font-semibold text-neutral-100"
                  style={{ fontFamily: "var(--font-blackops), system-ui" }}
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
                      inputRef={(el) => {
                        const rowRef = ensureRow(i);
                        rowRef[1] = el;
                      }}
                      onKeyDown={handleKeyDown(i, 1)}
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
  };

  /* ----------------------------- AIR UI ----------------------------- */

  const AirAxleCard = ({
    axle,
    rows,
  }: {
    axle: string;
    rows: AirRow[];
  }) => {
    // refs[rowIndex][colIndex] where colIndex 0 = Left, 1 = Right
    const inputRefs = useRef<(HTMLInputElement | null)[][]>([]);

    const ensureRow = (rowIndex: number) => {
      if (!inputRefs.current[rowIndex]) {
        inputRefs.current[rowIndex] = [];
      }
      return inputRefs.current[rowIndex];
    };

    const handleKeyDown =
      (rowIndex: number, colIndex: 0 | 1) =>
      (e: KeyboardEvent<HTMLInputElement>) => {
        const refs = inputRefs.current;
        if (!refs.length) return;

        const maxRow = refs.length - 1;

        const focusCell = (r: number, c: 0 | 1) => {
          const row = refs[r];
          if (!row) return;
          const next = row[c];
          if (next) {
            e.preventDefault();
            next.focus();
            next.select?.();
          }
        };

        switch (e.key) {
          case "ArrowRight": {
            if (colIndex === 0) {
              focusCell(rowIndex, 1);
            }
            break;
          }
          case "ArrowLeft": {
            if (colIndex === 1) {
              focusCell(rowIndex, 0);
            }
            break;
          }
          case "ArrowDown": {
            const nextRow = Math.min(maxRow, rowIndex + 1);
            focusCell(nextRow, colIndex);
            break;
          }
          case "ArrowUp": {
            const prevRow = Math.max(0, rowIndex - 1);
            focusCell(prevRow, colIndex);
            break;
          }
          default:
            break;
        }
      };

    return (
      <div className="rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/55 p-4 shadow-[0_18px_45px_rgba(0,0,0,0.9)] backdrop-blur-xl">
        <div
          className="mb-3 text-lg font-semibold uppercase tracking-[0.18em] text-[color:var(--accent-copper,#f97316)]"
          style={{ fontFamily: "var(--font-blackops), system-ui" }}
        >
          {axle}
        </div>

        <div className="mb-2 grid grid-cols-[1fr_auto_1fr] items-center gap-4 text-[11px] uppercase tracking-[0.16em] text-neutral-500">
          <div>Left</div>
          <div className="text-center">Item</div>
          <div className="text-right">Right</div>
        </div>

        {open && (
          <div className="space-y-3">
            {rows.map((row, i) => (
              <div
                key={`${axle}-${row.metric}-${i}`}
                className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 rounded-xl border border-slate-800/80 bg-neutral-950/80 p-3 shadow-[0_14px_35px_rgba(0,0,0,0.9)]"
              >
                <div>
                  {row.left ? (
                    <InputWithInlineUnit
                      idx={row.left.idx}
                      isPressureRow={row.left.isPressure}
                      unit={row.left.unit}
                      defaultValue={row.left.initial}
                      inputRef={(el) => {
                        const rowRef = ensureRow(i);
                        rowRef[0] = el;
                      }}
                      onKeyDown={handleKeyDown(i, 0)}
                    />
                  ) : (
                    <div className="h-[34px]" />
                  )}
                </div>

                <div
                  className="min-w-0 truncate text-center text-sm font-semibold text-neutral-100"
                  style={{ fontFamily: "var(--font-blackops), system-ui" }}
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
                      inputRef={(el) => {
                        const rowRef = ensureRow(i);
                        rowRef[1] = el;
                      }}
                      onKeyDown={handleKeyDown(i, 1)}
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
  };

  const countFilled = (cells: Array<{ idx: number }>) =>
    cells.reduce((sum, c) => sum + (filledMap[c.idx] ? 1 : 0), 0);

  /* ------------------------------- render ------------------------------ */

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 px-1">
        {/* progress strip for AIR mode */}
        {mode === "air" ? (
          <div
            className="hidden text-[11px] uppercase tracking-[0.14em] text-neutral-500 md:block"
            style={{ fontFamily: "Roboto, system-ui, sans-serif" }}
          >
            {airGroups.map((g, i) => {
              const filled = countFilled(g.left) + countFilled(g.right);
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
          <label className="flex select-none items-center gap-2 text-xs text-neutral-300">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-neutral-700 bg-neutral-900 accent-orange-500"
              checked={showKpa}
              onChange={(e) => setShowKpa(e.target.checked)}
              tabIndex={-1}
            />
            kPa hint
          </label>

          <button
            onClick={toggleOpen}
            className="rounded-full border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-neutral-100 shadow-[0_10px_24px_rgba(0,0,0,0.85)] hover:border-orange-500 hover:bg-black/80"
            title={open ? "Collapse" : "Expand"}
            tabIndex={-1}
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
        <div className="grid grid-cols-1 gap-4">
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
        className="rounded-full bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-black shadow-[0_0_18px_rgba(212,118,49,0.6)] hover:brightness-110 disabled:opacity-40"
        onClick={() => pending && onAddAxle(pending)}
        disabled={!pending}
      >
        + Add
      </button>
    </div>
  );
}