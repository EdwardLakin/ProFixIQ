// features/inspections/lib/inspection/ui/BatteryGrid.tsx
"use client";

import { useMemo, useState } from "react";
import { useInspectionForm } from "@inspections/lib/inspection/ui/InspectionFormContext";
import type { InspectionItem } from "@inspections/lib/inspection/types";

type Props = {
  sectionIndex: number;
  items: InspectionItem[];
  unitHint?: (label: string) => string;
};

type BatteryKind = "rating" | "tested";

type BatteryCell = {
  idx: number;
  batteryNum: number; // 1..5
  kind: BatteryKind;
};

const BATTERY_RE =
  /^(?<battery>(?:battery|bat)\s*#?\s*(?<num>\d+))\s*[:\-–—]?\s+(?<metric>.+)$/i;

function getLabel(it: InspectionItem): string {
  const anyIt = it as unknown as { item?: unknown; name?: unknown };
  return String(anyIt.item ?? anyIt.name ?? "").trim();
}

function kindFromMetric(metricRaw: string): BatteryKind | null {
  const m = metricRaw.toLowerCase();
  if (m.includes("rating") || m.includes("rated")) return "rating";
  if (m.includes("tested") || m.includes("test") || m.includes("load")) return "tested";
  return null;
}

function parseBatteryNum(batteryRaw: string): number | null {
  const m = batteryRaw.match(/(?:battery|bat)\s*#?\s*(\d+)/i);
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  if (n < 1 || n > 5) return null;
  return n;
}

function readValue(it: InspectionItem): string {
  const anyIt = it as unknown as { value?: unknown };
  const v = anyIt.value;
  return typeof v === "string" || typeof v === "number" ? String(v) : "";
}

export default function BatteryGrid({ sectionIndex, items }: Props) {
  // context may or may not include updateSection (depends how your Provider is wired)
  const ctx = useInspectionForm() as unknown as {
    updateItem: (sectionIndex: number, itemIndex: number, patch: Partial<InspectionItem>) => void;
    updateSection?: (sectionIndex: number, patch: { title?: string; items?: InspectionItem[] }) => void;
  };

  const { updateItem } = ctx;
  const updateSection = ctx.updateSection;

  const [open, setOpen] = useState(true);

  const grid = useMemo(() => {
    const cells: BatteryCell[] = [];

    items.forEach((it, idx) => {
      const label = getLabel(it);
      if (!label) return;

      const m = label.match(BATTERY_RE);
      if (!m?.groups) return;

      const batteryRaw = String(m.groups.battery ?? "").trim();
      const metricRaw = String(m.groups.metric ?? "").trim();

      const n = parseBatteryNum(batteryRaw);
      if (!n) return;

      const kind = kindFromMetric(metricRaw);
      if (!kind) return;

      cells.push({ idx, batteryNum: n, kind });
    });

    const maxExisting = cells.reduce((mx, c) => Math.max(mx, c.batteryNum), 0);
    const batteryCount = Math.min(5, Math.max(1, maxExisting || 1));

    const findCell = (n: number, kind: BatteryKind): BatteryCell | null => {
      const hit = cells.find((c) => c.batteryNum === n && c.kind === kind);
      return hit ?? null;
    };

    return { batteryCount, findCell };
  }, [items]);

  const commit = (idx: number, value: string) => {
    updateItem(sectionIndex, idx, { value });
  };

  const canAdd = typeof updateSection === "function";

  const handleAddBattery = () => {
    if (!updateSection) return;

    const nextNum = Math.min(5, grid.batteryCount + 1);
    if (nextNum <= grid.batteryCount) return;

    const nextItems: InspectionItem[] = [...items];

    // Add two items: Rating CCA + Tested CCA
    nextItems.push({ item: `Battery ${nextNum} Rating CCA`, unit: "CCA", status: "na" });
    nextItems.push({ item: `Battery ${nextNum} Tested CCA`, unit: "CCA", status: "na" });

    updateSection(sectionIndex, { items: nextItems });
  };

  return (
    <div className="grid w-full gap-3">
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="flex flex-col gap-1">
          <div
            className="text-base font-semibold uppercase tracking-[0.18em] text-orange-300"
            style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}
          >
            Battery Grid
          </div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-400">
            Rating CCA • Tested CCA (max 5 batteries)
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canAdd ? (
            <button
              type="button"
              className="rounded-full border border-orange-500/60 bg-orange-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-orange-100 hover:bg-orange-500/20 disabled:opacity-50"
              onClick={handleAddBattery}
              disabled={grid.batteryCount >= 5}
              title={grid.batteryCount >= 5 ? "Max 5 batteries" : "Add battery"}
            >
              + Add Battery
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-full border border-white/10 bg-black/55 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-100 hover:border-orange-500/70 hover:bg-black/70"
            aria-expanded={open}
            title={open ? "Collapse" : "Expand"}
            tabIndex={-1}
          >
            {open ? "Collapse" : "Expand"}
          </button>
        </div>
      </div>

      {open ? (
        <div className="overflow-x-auto">
          <div className="inline-block min-w-full align-middle">
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/55 shadow-[0_18px_45px_rgba(0,0,0,0.85)] backdrop-blur-xl">
              <table className="min-w-full table-fixed border-separate border-spacing-y-[2px]">
                <thead>
                  <tr>
                    <th className="w-[180px] px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-400">
                      Metric
                    </th>
                    {Array.from({ length: grid.batteryCount }, (_, i) => i + 1).map((n) => (
                      <th
                        key={n}
                        className="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-100"
                        style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}
                      >
                        Battery {n}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {(["rating", "tested"] as const).map((kind) => (
                    <tr key={kind} className="align-middle">
                      <td className="px-3 py-1.5 text-sm font-semibold text-neutral-100">
                        {kind === "rating" ? "Rating (CCA)" : "Tested (CCA)"}
                      </td>

                      {Array.from({ length: grid.batteryCount }, (_, i) => i + 1).map((n) => {
                        const cell = grid.findCell(n, kind);

                        if (!cell) {
                          return (
                            <td key={n} className="px-3 py-1.5">
                              <div className="h-[34px]" />
                            </td>
                          );
                        }

                        const it = items[cell.idx];
                        const value = it ? readValue(it) : "";

                        return (
                          <td key={n} className="px-3 py-1.5">
                            <div className="relative mx-auto w-full max-w-[7.75rem]">
                              <input
                                value={value}
                                className="h-[34px] w-full rounded-lg border border-white/10 bg-black/55 px-3 py-1.5 pr-12 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/70"
                                placeholder={kind === "rating" ? "Rating" : "Tested"}
                                autoComplete="off"
                                inputMode="decimal"
                                type="number"
                                onChange={(e) => commit(cell.idx, e.currentTarget.value)}
                              />
                              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 whitespace-nowrap text-[11px] text-neutral-400">
                                CCA
                              </span>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>

              {!canAdd ? (
                <div className="border-t border-white/10 px-3 py-2 text-[11px] text-neutral-400">
                  Note: “Add Battery” requires <code>updateSection</code> to be provided by your InspectionForm context
                  provider.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}