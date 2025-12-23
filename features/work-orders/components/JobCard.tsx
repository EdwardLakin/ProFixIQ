// features/work-orders/components/JobCard.tsx
"use client";

import React, { useEffect, useState } from "react";
import type { Database } from "@shared/types/types/supabase";
import { UsePartButton } from "@work-orders/components/UsePartButton";
import { PartsUsedList } from "@work-orders/components/PartsUsedList";

type DB = Database;

export type WorkOrderLine = DB["public"]["Tables"]["work_order_lines"]["Row"];

export type AllocationRow =
  DB["public"]["Tables"]["work_order_part_allocations"]["Row"] & {
    parts?: { name: string | null } | null;
  };

export type TechnicianInfo = {
  id: string;
  full_name: string | null;
  role: string | null;
};

export type JobCardPricing = {
  partsTotal?: number | null;
  laborTotal?: number | null;
  lineTotal?: number | null;
  currency?: string; // e.g. "CAD", "USD"
};

export type JobCardProps = {
  index: number;
  line: WorkOrderLine;
  parts: AllocationRow[];
  technicians: TechnicianInfo[];
  canAssign?: boolean;
  isPunchedIn?: boolean;
  onOpen: () => void;
  onAssign?: () => void;
  onOpenInspection?: () => void;
  onAddPart?: () => void;
  /** Optional pricing info – we’ll wire this from the page later */
  pricing?: JobCardPricing;
};

/* ---------------------------- Status visuals ---------------------------- */

type KnownStatus =
  | "awaiting_approval"
  | "awaiting"
  | "queued"
  | "in_progress"
  | "on_hold"
  | "planned"
  | "new"
  | "completed"
  | "ready_to_invoice"
  | "invoiced";

/** Status pill styling */
const BASE_BADGE =
  "inline-flex items-center whitespace-nowrap rounded-full border px-3 py-1 text-[11px] sm:text-xs font-semibold tracking-wide";

const BADGE: Record<KnownStatus, string> = {
  awaiting_approval: "bg-blue-900/35 border-blue-400/45 text-blue-100",
  awaiting: "bg-sky-900/35 border-sky-400/40 text-sky-100",
  queued: "bg-indigo-900/35 border-indigo-400/40 text-indigo-100",

  // keep your copper in_progress (matches your current theme direction)
  in_progress:
    "bg-[color:var(--accent-copper-900,rgba(120,63,28,0.35))] border-[color:var(--accent-copper-soft,rgba(205,120,64,0.55))] text-[color:var(--accent-copper-light,#f6d2b3)]",

  on_hold: "bg-amber-900/35 border-amber-400/45 text-amber-100",
  planned: "bg-purple-900/35 border-purple-400/45 text-purple-100",
  new: "bg-neutral-900/60 border-neutral-500/45 text-neutral-100",
  completed: "bg-emerald-900/30 border-emerald-400/40 text-emerald-100",
  ready_to_invoice: "bg-emerald-900/30 border-emerald-400/40 text-emerald-100",
  invoiced: "bg-teal-900/30 border-teal-400/40 text-teal-100",
};

const statusChip = (s: string | null | undefined): string => {
  const key = (s ?? "awaiting")
    .toLowerCase()
    .replaceAll(" ", "_") as KnownStatus;
  return `${BASE_BADGE} ${BADGE[key] ?? BADGE.awaiting}`;
};

/**
 * Restored “old” card surface feel:
 * - calmer glass
 * - thin light borders
 * - subtle status tint (not heavy gradients)
 */
const CARD_SURFACE: Record<
  KnownStatus,
  { border: string; surface: string; ring: string }
> = {
  awaiting_approval: {
    border: "border-white/12",
    surface: "bg-[rgba(0,0,0,0.42)]",
    ring: "ring-sky-300/40",
  },
  awaiting: {
    border: "border-white/12",
    surface: "bg-[rgba(0,0,0,0.42)]",
    ring: "ring-white/20",
  },
  queued: {
    border: "border-white/12",
    surface: "bg-[rgba(0,0,0,0.42)]",
    ring: "ring-indigo-300/35",
  },
  in_progress: {
    border: "border-white/12",
    surface: "bg-[rgba(0,0,0,0.42)]",
    ring: "ring-[color:var(--accent-copper-soft,rgba(205,120,64,0.45))]",
  },
  on_hold: {
    border: "border-white/12",
    surface: "bg-[rgba(0,0,0,0.42)]",
    ring: "ring-amber-300/35",
  },
  planned: {
    border: "border-white/12",
    surface: "bg-[rgba(0,0,0,0.42)]",
    ring: "ring-purple-300/35",
  },
  new: {
    border: "border-white/12",
    surface: "bg-[rgba(0,0,0,0.42)]",
    ring: "ring-white/20",
  },
  completed: {
    border: "border-white/12",
    surface: "bg-[rgba(0,0,0,0.42)]",
    ring: "ring-teal-300/30",
  },
  ready_to_invoice: {
    border: "border-white/12",
    surface: "bg-[rgba(0,0,0,0.42)]",
    ring: "ring-emerald-300/30",
  },
  invoiced: {
    border: "border-white/12",
    surface: "bg-[rgba(0,0,0,0.42)]",
    ring: "ring-teal-300/30",
  },
};

export function JobCard({
  index,
  line,
  parts,
  technicians,
  canAssign,
  isPunchedIn,
  onOpen,
  onAssign,
  onOpenInspection,
  onAddPart,
  pricing,
}: JobCardProps): JSX.Element {
  const statusKey = (line.status ?? "awaiting")
    .toLowerCase()
    .replaceAll(" ", "_") as KnownStatus;

  const surfaceCfg = CARD_SURFACE[statusKey] ?? CARD_SURFACE.awaiting;

  const [partsOpen, setPartsOpen] = useState(false);

  const isCompletedLike = () => {
    const s = (line.status ?? "").toLowerCase();
    return s === "completed" || s === "ready_to_invoice" || s === "invoiced";
  };

  const [collapsed, setCollapsed] = useState<boolean>(isCompletedLike());

  useEffect(() => {
    setCollapsed(isCompletedLike());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line.status]);

  const jobLabel = line.description || line.complaint || "Untitled job";

  const laborText =
    typeof line.labor_time === "number" ? `${line.labor_time}h` : "—";

  const jobTypeText = String(line.job_type ?? "job").replaceAll("_", " ");
  const statusText = String(line.status ?? "awaiting").replaceAll("_", " ");

  const showPricingRow =
    pricing &&
    (pricing.partsTotal != null ||
      pricing.laborTotal != null ||
      pricing.lineTotal != null);

  const currency =
    pricing?.currency && pricing.currency.trim().length > 0
      ? pricing.currency
      : undefined;

  const formatMoney = (v: number | null | undefined): string => {
    if (v == null || Number.isNaN(v)) return "—";
    const n = Number(v);
    return `${currency ?? "$"}${n.toFixed(2)}`;
  };

  const partsCount = parts.length;
  const partsSummary =
    partsCount === 0
      ? "No parts yet"
      : `${partsCount} part${partsCount === 1 ? "" : "s"}`;

  const handleCardClick = () => {
    onOpen();
  };

  const toggleCollapsed = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setCollapsed((c) => !c);
  };

  const inspectionBtnClass = isCompletedLike()
    ? "border-white/14 text-teal-100 hover:bg-white/5"
    : "border-white/14 text-white/85 hover:bg-white/5 hover:text-white";

  return (
    <div
      className={[
        "group cursor-pointer rounded-xl border p-3 transition",
        surfaceCfg.border,
        surfaceCfg.surface,
        "backdrop-blur-xl",
        // restored calmer shadow + hover
        "shadow-[0_14px_40px_rgba(0,0,0,0.80)] hover:shadow-[0_18px_48px_rgba(0,0,0,0.92)]",
        // punched-in ring is the main accent
        isPunchedIn ? `ring-2 ${surfaceCfg.ring}` : "ring-0",
        // subtle hover border accent (not always copper)
        "hover:border-white/18",
      ].join(" ")}
      title="Open focused job"
      onClick={handleCardClick}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <div className="truncate text-sm font-medium text-white">
                {index + 1}. {jobLabel}
              </div>

              {canAssign && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAssign?.();
                  }}
                  className="rounded-md border border-white/14 bg-black/20 px-2 py-0.5 text-[11px] font-medium text-white/80 hover:bg-white/5"
                  title="Assign mechanic to this line"
                >
                  Assign mechanic
                </button>
              )}

              {line.job_type === "inspection" && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenInspection?.();
                  }}
                  className={`rounded-md border bg-black/15 px-2 py-0.5 text-[11px] font-medium ${inspectionBtnClass}`}
                >
                  {isCompletedLike() ? "View inspection" : "Open inspection"}
                </button>
              )}
            </div>

            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={toggleCollapsed}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/12 bg-black/35 text-[11px] text-white/80 shadow-[0_0_14px_rgba(0,0,0,0.55)] hover:border-white/20 hover:text-white hover:bg-black/60"
                title={collapsed ? "Expand job details" : "Collapse job details"}
              >
                <span
                  className={`inline-block transform text-[11px] transition-transform ${
                    collapsed ? "" : "rotate-90"
                  }`}
                >
                  ▶
                </span>
              </button>

              <span className={statusChip(line.status)}>{statusText}</span>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddPart?.();
                }}
                className="hidden rounded-md border border-white/14 bg-black/20 px-2 py-1 text-[11px] font-medium text-white/80 hover:border-white/20 hover:text-white hover:bg-white/5 sm:inline-flex"
                title="Add / use part on this job"
              >
                Add part
              </button>

              <div className="sm:hidden">
                <UsePartButton
                  workOrderLineId={line.id}
                  onApplied={() =>
                    window.dispatchEvent(new CustomEvent("wo:parts-used"))
                  }
                  label="Add part"
                />
              </div>
            </div>
          </div>

          <div className="text-[11px] text-white/65">
            {jobTypeText} • {laborText} • Status: {statusText}
          </div>

          {isCompletedLike() && (
            <div className="text-[10px] text-white/55">
              {collapsed
                ? "Completed job – use the chevron to view details."
                : "Completed job – use the chevron to collapse details."}
            </div>
          )}

          {!collapsed && (
            <>
              {technicians.length > 0 && (
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {technicians.map((tech) => (
                    <span
                      key={tech.id}
                      className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/25 px-2 py-0.5 text-[10px] text-white/80 backdrop-blur-md"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-white/60" />
                      {tech.full_name ?? "Mechanic"}
                    </span>
                  ))}
                </div>
              )}

              {(line.complaint || line.cause || line.correction) && (
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-white/70">
                  {line.complaint && <span>Cmpl: {line.complaint}</span>}
                  {line.cause && <span>| Cause: {line.cause}</span>}
                  {line.correction && <span>| Corr: {line.correction}</span>}
                </div>
              )}

              <div className="mt-2 rounded-lg border border-white/10 bg-black/35 backdrop-blur-md">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPartsOpen((open) => !open);
                  }}
                >
                  <div className="flex flex-col">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-white/75">
                      Parts used
                    </span>
                    <span className="text-[10px] text-white/45">
                      {partsSummary}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAddPart?.();
                      }}
                      className="inline-flex items-center rounded-md border border-white/12 bg-black/25 px-2 py-0.5 text-[11px] font-medium text-white/75 hover:border-white/20 hover:text-white hover:bg-white/5 sm:hidden"
                    >
                      Add part
                    </button>

                    <span
                      className={`text-[10px] text-white/55 transition-transform ${
                        partsOpen ? "rotate-90" : ""
                      }`}
                    >
                      ▶
                    </span>
                  </div>
                </button>

                {partsOpen && (
                  <div
                    className="border-t border-white/10 px-2 pb-2 pt-1.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <PartsUsedList allocations={parts} />
                  </div>
                )}
              </div>

              {showPricingRow && (
                <div className="mt-2 flex flex-wrap items-center justify-end gap-3 text-[11px] text-white/70">
                  {pricing?.partsTotal != null && (
                    <span className="flex items-center gap-1">
                      <span className="text-white/45">Parts</span>
                      <span className="font-semibold">
                        {formatMoney(pricing.partsTotal)}
                      </span>
                    </span>
                  )}
                  {pricing?.laborTotal != null && (
                    <span className="flex items-center gap-1">
                      <span className="text-white/45">Labor</span>
                      <span className="font-semibold">
                        {formatMoney(pricing.laborTotal)}
                      </span>
                    </span>
                  )}
                  {pricing?.lineTotal != null && (
                    <span className="flex items-center gap-1">
                      <span className="text-white/45">Line total</span>
                      <span className="font-semibold text-white">
                        {formatMoney(pricing.lineTotal)}
                      </span>
                    </span>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}