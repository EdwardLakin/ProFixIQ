"use client";

import { useState } from "react";
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
  "inline-flex items-center whitespace-nowrap rounded border px-2 py-0.5 text-[10px] font-medium";

const BADGE: Record<KnownStatus, string> = {
  awaiting_approval: "bg-blue-900/20 border-blue-500/40 text-blue-300",
  awaiting: "bg-sky-900/20  border-sky-500/40  text-sky-300",
  queued: "bg-indigo-900/20 border-indigo-500/40 text-indigo-300",
  in_progress: "bg-orange-900/20 border-orange-500/40 text-orange-300",
  on_hold: "bg-amber-900/20  border-amber-500/40  text-amber-300",
  planned: "bg-purple-900/20 border-purple-500/40 text-purple-300",
  new: "bg-neutral-800   border-neutral-600   text-neutral-200",
  completed: "bg-green-900/20  border-green-500/40 text-green-300",
  ready_to_invoice:
    "bg-emerald-900/20 border-emerald-500/40 text-emerald-300",
  invoiced: "bg-teal-900/20    border-teal-500/40    text-teal-300",
};

function statusChip(status: string | null | undefined): string {
  const key = (status ?? "awaiting")
    .toLowerCase()
    .replaceAll(" ", "_") as KnownStatus;
  return `${BASE_BADGE} ${BADGE[key] ?? BADGE.awaiting}`;
}

const statusBorder: Record<string, string> = {
  awaiting: "border-l-4 border-slate-400",
  queued: "border-l-4 border-indigo-400",
  in_progress: "border-l-4 border-orange-500",
  on_hold: "border-l-4 border-amber-500",
  completed: "border-l-4 border-green-500",
  awaiting_approval: "border-l-4 border-blue-500",
  planned: "border-l-4 border-purple-500",
  new: "border-l-4 border-gray-400",
};

const statusRowTint: Record<string, string> = {
  awaiting: "bg-neutral-950",
  queued: "bg-neutral-950",
  in_progress: "bg-neutral-950",
  on_hold: "bg-amber-900/30",
  completed: "bg-green-900/30",
  awaiting_approval: "bg-neutral-950",
  planned: "bg-neutral-950",
  new: "bg-neutral-950",
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
    .replaceAll(" ", "_");
  const borderCls =
    statusBorder[statusKey] ?? "border-l-4 border-gray-400";
  const tintCls = statusRowTint[statusKey] ?? "bg-neutral-950";

  const [partsOpen, setPartsOpen] = useState(false);

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

  return (
    <div
      className={`group cursor-pointer rounded-lg border border-neutral-800 ${tintCls} p-3 transition hover:border-orange-500/70 hover:bg-neutral-900/80 ${borderCls} ${
        isPunchedIn ? "ring-2 ring-orange-500/80" : ""
      }`}
      title="Open focused job"
      onClick={onOpen}
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
                      ? "border-green-400 text-green-200"
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
          <div className="text-[11px] text-neutral-400">
            {jobTypeText} • {laborText} • Status: {statusText}
          </div>

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
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-neutral-400">
              {line.complaint && <span>Cmpl: {line.complaint}</span>}
              {line.cause && <span>| Cause: {line.cause}</span>}
              {line.correction && <span>| Corr: {line.correction}</span>}
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
                  <span className="text-neutral-500">Parts</span>
                  <span className="font-semibold">
                    {formatMoney(pricing.partsTotal)}
                  </span>
                </span>
              )}
              {pricing?.laborTotal != null && (
                <span className="flex items-center gap-1">
                  <span className="text-neutral-500">Labor</span>
                  <span className="font-semibold">
                    {formatMoney(pricing.laborTotal)}
                  </span>
                </span>
              )}
              {pricing?.lineTotal != null && (
                <span className="flex items-center gap-1">
                  <span className="text-neutral-500">Line total</span>
                  <span className="font-semibold text-orange-300">
                    {formatMoney(pricing.lineTotal)}
                  </span>
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}