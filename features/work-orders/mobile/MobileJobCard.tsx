"use client";

import { useEffect, useMemo, useState } from "react";
import type { Database } from "@shared/types/types/supabase";

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
  currency?: string;
};

export type ReviewIssue = { kind: string; lineId?: string; message: string };

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
  pricing?: JobCardPricing;

  reviewIssues?: ReviewIssue[];
  reviewOk?: boolean;
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
  "inline-flex items-center whitespace-nowrap rounded border px-2 py-0.5 text-[10px] font-medium tracking-wide";

const BADGE: Record<KnownStatus, string> = {
  awaiting_approval: "bg-blue-900/20 border-blue-500/40 text-blue-300",
  awaiting: "bg-sky-900/20 border-sky-500/40 text-sky-300",
  queued: "bg-indigo-900/20 border-indigo-500/40 text-indigo-300",
  in_progress: "bg-orange-900/20 border-orange-500/40 text-orange-300",
  on_hold: "bg-amber-900/20 border-amber-500/40 text-amber-300",
  planned: "bg-purple-900/20 border-purple-500/40 text-purple-300",
  new: "bg-neutral-800 border-neutral-600 text-neutral-200",
  completed: "bg-green-900/20 border-green-500/40 text-green-300",
  ready_to_invoice:
    "bg-emerald-900/20 border-emerald-500/40 text-emerald-300",
  invoiced: "bg-teal-900/20 border-teal-500/40 text-teal-300",
};

const statusChip = (s: string | null | undefined): string => {
  const key = (s ?? "awaiting")
    .toLowerCase()
    .replaceAll(" ", "_") as KnownStatus;
  return `${BASE_BADGE} ${BADGE[key] ?? BADGE.awaiting}`;
};

const CARD_SURFACE: Record<
  KnownStatus,
  { border: string; surface: string; ring: string }
> = {
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

/* ---------------------------- Review indicators ---------------------------- */

type ReviewFlags = {
  missingCause: boolean;
  missingCorrection: boolean;
  noParts: boolean;
  missingComplaint: boolean;
  otherIssues: number;
};

function norm(s: unknown): string {
  return String(s ?? "").trim().toLowerCase();
}

function computeReviewFlags(args: {
  line: WorkOrderLine;
  partsCount: number;
  reviewIssues?: ReviewIssue[];
}): ReviewFlags {
  const localMissingCause = !norm(args.line.cause);
  const localMissingCorrection = !norm(args.line.correction);
  const localMissingComplaint = !norm(args.line.complaint) && !norm(args.line.description);
  const localNoParts = args.partsCount === 0;

  const issues = Array.isArray(args.reviewIssues) ? args.reviewIssues : [];

  let aiMissingCause = false;
  let aiMissingCorrection = false;
  let aiMissingComplaint = false;
  let aiNoParts = false;
  let other = 0;

  for (const it of issues) {
    const k = norm(it.kind);
    const m = norm(it.message);

    const hasCause = k.includes("cause") || m.includes("cause");
    const hasCorrection = k.includes("correction") || m.includes("corr");
    const hasComplaint = k.includes("complaint") || m.includes("description");
    const hasParts = k.includes("part") || m.includes("part");

    if (hasCause) aiMissingCause = true;
    else if (hasCorrection) aiMissingCorrection = true;
    else if (hasComplaint) aiMissingComplaint = true;
    else if (hasParts) aiNoParts = true;
    else other += 1;
  }

  return {
    missingCause: aiMissingCause || localMissingCause,
    missingCorrection: aiMissingCorrection || localMissingCorrection,
    missingComplaint: aiMissingComplaint || localMissingComplaint,
    noParts: aiNoParts || localNoParts,
    otherIssues: other,
  };
}

function ReviewIcon({
  title,
  label,
  tone,
}: {
  title: string;
  label: string;
  tone: "ok" | "warn" | "info";
}) {
  const base =
    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide";
  const cls =
    tone === "ok"
      ? "border-emerald-400/60 bg-emerald-500/10 text-emerald-100"
      : tone === "warn"
        ? "border-amber-400/60 bg-amber-500/10 text-amber-100"
        : "border-white/15 bg-black/40 text-neutral-200";
  return (
    <span className={`${base} ${cls}`} title={title}>
      {label}
    </span>
  );
}

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
  pricing,
  reviewIssues,
  reviewOk,
}: JobCardProps): JSX.Element {
  const statusKey = (line.status ?? "awaiting")
    .toLowerCase()
    .replaceAll(" ", "_") as KnownStatus;

  const surfaceCfg = CARD_SURFACE[statusKey] ?? CARD_SURFACE.awaiting;

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

  const reviewFlags = useMemo(
    () =>
      computeReviewFlags({
        line,
        partsCount,
        reviewIssues,
      }),
    [line, partsCount, reviewIssues],
  );

  const handleCardClick = () => {
    if (isCompletedLike()) setCollapsed(false);
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
                    isCompletedLike()
                      ? "border-teal-400 text-teal-200"
                      : "border-orange-400 text-orange-200 hover:bg-orange-500/10"
                  }`}
                >
                  {isCompletedLike() ? "View inspection" : "Open inspection"}
                </button>
              )}
            </div>

            <div className="ml-auto flex items-center gap-2">
              <span className={statusChip(line.status)}>{statusText}</span>
            </div>
          </div>

          {/* ✅ Review icons row (only after completed-like) */}
          {isCompletedLike() && (
            <div className="flex flex-wrap items-center gap-2">
              {reviewOk ? (
                <ReviewIcon
                  tone="ok"
                  title="AI invoice review passed for this work order"
                  label="✅ Reviewed"
                />
              ) : (
                <ReviewIcon
                  tone="info"
                  title="Review not passed yet (or not run). Icons below show what needs fixing."
                  label="🧠 Review"
                />
              )}

              {reviewFlags.missingCause && (
                <ReviewIcon tone="warn" title="Cause is missing" label="⚠ Cause" />
              )}
              {reviewFlags.missingCorrection && (
                <ReviewIcon
                  tone="warn"
                  title="Correction is missing"
                  label="⚠ Correction"
                />
              )}
              {reviewFlags.noParts && (
                <ReviewIcon tone="warn" title="No parts recorded" label="⚠ No parts" />
              )}
              {reviewFlags.missingComplaint && (
                <ReviewIcon
                  tone="warn"
                  title="Complaint/description missing"
                  label="⚠ No complaint"
                />
              )}
              {reviewFlags.otherIssues > 0 && (
                <ReviewIcon
                  tone="warn"
                  title="Other review issues exist"
                  label={`⚠ +${reviewFlags.otherIssues}`}
                />
              )}
            </div>
          )}

          <div className="text-[11px] text-neutral-300">
            {jobTypeText} • {laborText} • Status: {statusText}
          </div>

          {isCompletedLike() && (
            <div className="text-[10px] text-teal-200/80">
              {collapsed
                ? "Completed job – tap to view details."
                : "Completed job – tap header to collapse."}
            </div>
          )}

          {!collapsed && (
            <>
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

              {(line.complaint || line.cause || line.correction) && (
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-neutral-300">
                  {line.complaint && <span>Cmpl: {line.complaint}</span>}
                  {line.cause && <span>| Cause: {line.cause}</span>}
                  {line.correction && <span>| Corr: {line.correction}</span>}
                </div>
              )}

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