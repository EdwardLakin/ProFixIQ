"use client";

import { useEffect, useState } from "react";
import type { Database } from "@shared/types/types/supabase";
import { UsePartButton } from "@work-orders/components/UsePartButton";
import { PartsUsedList } from "@work-orders/components/PartsUsedList";

type DB = Database;

export type WorkOrderLine =
  DB["public"]["Tables"]["work_order_lines"]["Row"];

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

const BASE_BADGE =
  "inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide";

const BADGE: Record<KnownStatus, string> = {
  awaiting_approval:
    "bg-sky-900/30 border-sky-400/60 text-sky-200 shadow-[0_0_14px_rgba(56,189,248,0.35)]",
  awaiting:
    "bg-slate-900/40 border-slate-400/60 text-slate-200 shadow-[0_0_14px_rgba(148,163,184,0.28)]",
  queued:
    "bg-indigo-900/30 border-indigo-400/70 text-indigo-200 shadow-[0_0_16px_rgba(129,140,248,0.40)]",
  in_progress:
    "bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.32),rgba(15,23,42,0.95))] border-[color:var(--accent-copper-soft)] text-[color:var(--accent-copper-light)] shadow-[0_0_20px_rgba(248,113,22,0.55)]",
  on_hold:
    "bg-amber-950/40 border-amber-400/70 text-amber-200 shadow-[0_0_18px_rgba(251,191,36,0.45)]",
  planned:
    "bg-purple-950/40 border-purple-400/70 text-purple-200 shadow-[0_0_18px_rgba(147,51,234,0.40)]",
  new:
    "bg-neutral-900/80 border-neutral-500/70 text-neutral-200 shadow-[0_0_14px_rgba(148,163,184,0.28)]",
  completed:
    "bg-teal-950/50 border-teal-400/80 text-teal-200 shadow-[0_0_20px_rgba(45,212,191,0.60)]",
  ready_to_invoice:
    "bg-emerald-950/40 border-emerald-400/80 text-emerald-200 shadow-[0_0_20px_rgba(16,185,129,0.55)]",
  invoiced:
    "bg-teal-950/40 border-teal-400/80 text-teal-200 shadow-[0_0_20px_rgba(45,212,191,0.60)]",
};

function statusChip(status: string | null | undefined): string {
  const key = (status ?? "awaiting")
    .toLowerCase()
    .replaceAll(" ", "_") as KnownStatus;
  return `${BASE_BADGE} ${BADGE[key] ?? BADGE.awaiting}`;
}

/**
 * Card border / background styles – kept in sync with the mobile WO client
 */
const CARD_SURFACE: Record<KnownStatus, { border: string; surface: string; ring: string }> = {
  awaiting_approval: {
    border: "border-sky-500/50",
    surface:
      "bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.10),rgba(15,23,42,0.98))]",
    ring: "ring-sky-400/70",
  },
  awaiting: {
    border: "border-slate-600/70",
    surface:
      "bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.12),rgba(15,23,42,0.98))]",
    ring: "ring-slate-300/80",
  },
  queued: {
    border: "border-indigo-500/70",
    surface:
      "bg-[radial-gradient(circle_at_top,_rgba(129,140,248,0.12),rgba(15,23,42,0.98))]",
    ring: "ring-indigo-400/80",
  },
  in_progress: {
    border: "border-[color:var(--accent-copper-soft)]",
    surface:
      "bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.20),rgba(15,23,42,0.98))]",
    ring: "ring-[color:var(--accent-copper-soft)]/80",
  },
  on_hold: {
    border: "border-amber-400/80",
    surface:
      "bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.18),rgba(15,23,42,0.97))]",
    ring: "ring-amber-300/80",
  },
  planned: {
    border: "border-purple-400/80",
    surface:
      "bg-[radial-gradient(circle_at_top,_rgba(192,132,252,0.16),rgba(15,23,42,0.98))]",
    ring: "ring-purple-300/80",
  },
  new: {
    border: "border-neutral-600/80",
    surface: "bg-neutral-950/90",
    ring: "ring-neutral-400/80",
  },
  completed: {
    border: "border-teal-400/80",
    surface:
      "bg-[radial-gradient(circle_at_top,_rgba(45,212,191,0.18),rgba(15,23,42,0.97))]",
    ring: "ring-teal-300/80",
  },
  ready_to_invoice: {
    border: "border-emerald-400/80",
    surface:
      "bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.18),rgba(15,23,42,0.97))]",
    ring: "ring-emerald-300/80",
  },
  invoiced: {
    border: "border-teal-400/80",
    surface:
      "bg-[radial-gradient(circle_at_top,_rgba(45,212,191,0.18),rgba(15,23,42,0.97))]",
    ring: "ring-teal-300/80",
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

  // Completed jobs start collapsed; others are fully open
  const [collapsed, setCollapsed] = useState<boolean>(
    (line.status ?? "").toLowerCase() === "completed",
  );

  // If status changes (e.g. job finished), update collapsed state
  useEffect(() => {
    setCollapsed((line.status ?? "").toLowerCase() === "completed");
  }, [line.status]);

  const jobLabel =
    line.description || line.complaint || "Untitled job";

  const laborText =
    typeof line.labor_time === "number"
      ? `${line.labor_time}h`
      : "—";

  const jobTypeText = String(line.job_type ?? "job").replaceAll(
    "_",
    " ",
  );
  const statusText = String(line.status ?? "awaiting").replaceAll(
    "_",
    " ",
  );

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
    // Always open job, but let completed jobs also toggle collapse
    if ((line.status ?? "").toLowerCase() === "completed") {
      setCollapsed((c) => !c);
    }
    onOpen();
  };

  return (
    <div
      className={`group cursor-pointer rounded-xl border ${surfaceCfg.border} ${surfaceCfg.surface} p-3 transition
        shadow-[0_18px_45px_rgba(0,0,0,0.85)]
        hover:shadow-[0_22px_55px_rgba(0,0,0,0.95)]
        ${isPunchedIn ? `ring-2 ${surfaceCfg.ring}` : "ring-0"}
      `}
      title="Open focused job"
      onClick={handleCardClick}
    >
      <div className="flex items-start justify-between gap-3">
        {/* LEFT CONTENT */}
        <div className="min-w-0 space-y-1.5">
          {/* Top row: title + controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Left side: title + assign + inspection */}
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
                  className="rounded-md border border-sky-500/70 px-2 py-0.5 text-[11px] font-medium text-sky-200 hover:bg-sky-900/25"
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
                  className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${
                    line.status === "completed"
                      ? "border-teal-400 text-teal-200"
                      : "border-orange-400 text-orange-200 hover:bg-orange-500/10"
                  }`}
                >
                  {line.status === "completed"
                    ? "View inspection"
                    : "Open inspection"}
                </button>
              )}
            </div>

            {/* Right side: add part button + status pill (always right-aligned) */}
            <div className="ml-auto flex items-center gap-2">
              {/* Desktop add-part button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddPart?.();
                }}
                className="hidden rounded-md border border-neutral-600 px-2 py-1 text-[11px] font-medium text-neutral-100 hover:border-orange-500 hover:text-orange-100 sm:inline-flex"
                title="Add / use part on this job"
              >
                Add part
              </button>

              {/* keep existing UsePartButton behavior for safety (esp. mobile) */}
              <div className="sm:hidden">
                <UsePartButton
                  workOrderLineId={line.id}
                  onApplied={() =>
                    window.dispatchEvent(
                      new CustomEvent("wo:parts-used"),
                    )
                  }
                  label="Add part"
                />
              </div>

              <span className={statusChip(line.status)}>
                {statusText}
              </span>
            </div>
          </div>

          {/* Meta line */}
          <div className="text-[11px] text-neutral-300">
            {jobTypeText} • {laborText} • Status: {statusText}
          </div>

          {/* Completed jobs: small “tap to expand” hint */}
          {(line.status ?? "").toLowerCase() === "completed" && (
            <div className="text-[10px] text-teal-200/80">
              {collapsed
                ? "Completed job – tap to view details."
                : "Completed job – tap header to collapse."}
            </div>
          )}

          {/* Everything below here can be collapsed for completed lines */}
          {!collapsed && (
            <>
              {/* Technician chips */}
              {technicians.length > 0 && (
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {technicians.map((tech) => (
                    <span
                      key={tech.id}
                      className="inline-flex items-center gap-1 rounded-full bg-sky-900/40 px-2 py-0.5 text-[10px] text-sky-100"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-sky-300" />
                      {tech.full_name ?? "Mechanic"}
                    </span>
                  ))}
                </div>
              )}

              {/* Complaint / cause / correction */}
              {(line.complaint || line.cause || line.correction) && (
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-neutral-300">
                  {line.complaint && <span>Cmpl: {line.complaint}</span>}
                  {line.cause && <span>| Cause: {line.cause}</span>}
                  {line.correction && (
                    <span>| Corr: {line.correction}</span>
                  )}
                </div>
              )}

              {/* Parts accordion */}
              <div className="mt-2 rounded-lg border border-neutral-800 bg-neutral-950/80">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPartsOpen((open) => !open);
                  }}
                >
                  <div className="flex flex-col">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-300">
                      Parts used
                    </span>
                    <span className="text-[10px] text-neutral-500">
                      {partsSummary}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* small inline add-part on mobile + tablet */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAddPart?.();
                      }}
                      className="inline-flex items-center rounded-md border border-neutral-700 px-2 py-0.5 text-[11px] font-medium text-neutral-200 hover:border-orange-500 hover:text-orange-100 sm:hidden"
                    >
                      Add part
                    </button>

                    <span
                      className={`text-[10px] text-neutral-400 transition-transform ${
                        partsOpen ? "rotate-90" : ""
                      }`}
                    >
                      ▶
                    </span>
                  </div>
                </button>

                {partsOpen && (
                  <div
                    className="border-t border-neutral-800 px-2 pb-2 pt-1.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <PartsUsedList allocations={parts} />
                  </div>
                )}
              </div>

              {/* Pricing summary row (optional, only if provided) */}
              {showPricingRow && (
                <div className="mt-2 flex flex-wrap items-center justify-end gap-3 text-[11px] text-neutral-300">
                  {pricing?.partsTotal != null && (
                    <span className="flex items-center gap-1">
                      <span className="text-neutral-400">Parts</span>
                      <span className="font-semibold">
                        {formatMoney(pricing.partsTotal)}
                      </span>
                    </span>
                  )}
                  {pricing?.laborTotal != null && (
                    <span className="flex items-center gap-1">
                      <span className="text-neutral-400">Labor</span>
                      <span className="font-semibold">
                        {formatMoney(pricing.laborTotal)}
                      </span>
                    </span>
                  )}
                  {pricing?.lineTotal != null && (
                    <span className="flex items-center gap-1">
                      <span className="text-neutral-400">Line total</span>
                      <span className="font-semibold text-[color:var(--accent-copper-light)]">
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