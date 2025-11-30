"use client";

import React from "react";

export interface BatteryMeasurement {
  label: string;
  factoryCca: number | null;
  testedCca: number | null;
  notes?: string;
}

interface BatteryGridProps {
  title?: string;
  batteries: BatteryMeasurement[];
  onChange: (index: number, patch: Partial<BatteryMeasurement>) => void;
  onAddBattery: () => void;
  onRemoveBattery?: (index: number) => void;
}

const BatteryGrid: React.FC<BatteryGridProps> = ({
  title = "Battery Measurements",
  batteries,
  onChange,
  onAddBattery,
  onRemoveBattery,
}) => {
  return (
    <section className="metal-card rounded-2xl p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-white sm:text-base">
            {title}
          </h3>
          <p className="text-[11px] text-neutral-400">
            Capture factory and tested CCA for each battery. Values only – any
            FAIL / RECOMMEND status is handled in the main inspection sections.
          </p>
        </div>
        <button
          type="button"
          onClick={onAddBattery}
          className="rounded-full bg-[color:var(--accent-copper)] px-3 py-1.5 text-[11px] font-semibold text-black shadow-[0_0_20px_rgba(193,102,59,0.75)] hover:bg-[color:var(--accent-copper-soft)]"
        >
          + Add battery
        </button>
      </div>

      {batteries.length === 0 ? (
        <p className="text-xs text-neutral-400">
          No batteries added yet. Use “Add battery” to start.
        </p>
      ) : (
        <div className="space-y-3">
          {batteries.map((batt, idx) => (
            <div
              key={idx}
              className="rounded-xl border border-white/10 bg-black/65 p-3 shadow-[0_12px_30px_rgba(0,0,0,0.9)] backdrop-blur-md"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex flex-col">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
                    Battery {idx + 1}
                  </span>
                  <input
                    type="text"
                    className="mt-1 w-full rounded border border-white/15 bg-black/40 px-2 py-1 text-sm text-white placeholder:text-neutral-500 focus:outline-none"
                    placeholder="Location / label (Start, Aux, LH, RH...)"
                    value={batt.label}
                    onChange={(e) =>
                      onChange(idx, { label: e.target.value })
                    }
                  />
                </div>

                {onRemoveBattery && batteries.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onRemoveBattery(idx)}
                    className="rounded-full border border-red-500/70 px-2 py-1 text-[10px] font-medium text-red-100 hover:bg-red-500/10"
                  >
                    Remove
                  </button>
                )}
              </div>

              <div className="grid gap-3 text-xs sm:grid-cols-3">
                <div className="space-y-1">
                  <div className="text-[11px] text-neutral-400">
                    Factory CCA
                  </div>
                  <input
                    type="number"
                    inputMode="numeric"
                    className="w-full rounded border border-white/15 bg-black/40 px-2 py-1 text-sm text-white placeholder:text-neutral-500 focus:outline-none"
                    placeholder="e.g. 750"
                    value={batt.factoryCca ?? ""}
                    onChange={(e) =>
                      onChange(idx, {
                        factoryCca:
                          e.target.value === ""
                            ? null
                            : Number(e.target.value),
                      })
                    }
                  />
                </div>

                <div className="space-y-1">
                  <div className="text-[11px] text-neutral-400">
                    Tested CCA
                  </div>
                  <input
                    type="number"
                    inputMode="numeric"
                    className="w-full rounded border border-white/15 bg-black/40 px-2 py-1 text-sm text-white placeholder:text-neutral-500 focus:outline-none"
                    placeholder="e.g. 680"
                    value={batt.testedCca ?? ""}
                    onChange={(e) =>
                      onChange(idx, {
                        testedCca:
                          e.target.value === ""
                            ? null
                            : Number(e.target.value),
                      })
                    }
                  />
                </div>

                <div className="space-y-1 sm:col-span-1">
                  <div className="text-[11px] text-neutral-400">Notes</div>
                  <textarea
                    rows={2}
                    className="w-full resize-none rounded border border-white/15 bg-black/40 px-2 py-1 text-xs text-white placeholder:text-neutral-500 focus:outline-none"
                    placeholder="Additional info (age, location, condition...)"
                    value={batt.notes ?? ""}
                    onChange={(e) =>
                      onChange(idx, { notes: e.target.value })
                    }
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

export default BatteryGrid;