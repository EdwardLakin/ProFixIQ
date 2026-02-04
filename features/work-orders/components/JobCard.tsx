// features/work-orders/components/JobCard.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
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

/** Optional per-line review signal from AI invoice review */
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
  /** Optional pricing info – we’ll wire this from the page later */
  pricing?: JobCardPricing;

  /**
   * ✅ Optional AI review results for THIS line.
   * - Pass issues that belong to this lineId only.
   * - If omitted, card still shows local checks (missing cause/correction, no parts).
   */
  reviewIssues?: ReviewIssue[];
  /** ✅ Optional: if the overall WO review has passed */
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

/** EXACT same pill basis */
const BASE_BADGE =
  "inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tracking-wide";

const BADGE: Record<KnownStatus, string> = {
  awaiting_approval: "bg-blue-900/30 border-blue-400/50 text-blue-100",
  awaiting: "bg-slate-900/40 border-slate-400/60 text-slate-100",
  queued: "bg-indigo-900/35 border-indigo-400/55 text-indigo-100",
  in_progress:
    "bg-[color:var(--accent-copper,#f97316)]/10 border-[color:var(--accent-copper-soft,#fdba74)] text-[color:var(--accent-copper-light,#fed7aa)]",
  on_hold: "bg-amber-900/30 border-amber-400/55 text-amber-100",
  planned: "bg-purple-900/30 border-purple-400/55 text-purple-100",
  new: "bg-neutral-950/70 border-neutral-600/60 text-neutral-100",
  completed: "bg-emerald-900/25 border-emerald-400/60 text-emerald-100",
  ready_to_invoice:
    "bg-emerald-900/30 border-emerald-400/60 text-emerald-100",
  invoiced: "bg-teal-900/30 border-teal-400/60 text-teal-100",
};

const STATUS_ICON: Record<KnownStatus, string> = {
  awaiting_approval: "⏳",
  awaiting: "●",
  queued: "📋",
  in_progress: "🔧",
  on_hold: "⏸",
  planned: "🧩",
  new: "✨",
  completed: "✅",
  ready_to_invoice: "💳",
  invoiced: "📄",
};

const statusChip = (s: string | null | undefined): string => {
  const key = (s ?? "awaiting")
    .toLowerCase()
    .replaceAll(" ", "_") as KnownStatus;
  return `${BASE_BADGE} ${BADGE[key] ?? BADGE.awaiting}`;
};

/** EXACT surface system but with stronger hero presence */
const CARD_SURFACE: Record<
  KnownStatus,
  { border: string; surface: string; ring: string; rail: string }
> = {
  awaiting_approval: {
    border: "border-sky-500/60",
    surface:
      "bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.12),rgba(15,23,42,0.98))]",
    ring: "ring-sky-400/70",
    rail: "from-sky-500/70 via-sky-400/40 to-transparent",
  },
  awaiting: {
    border: "border-slate-600/70",
    surface:
      "bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.16),rgba(15,23,42,0.98))]",
    ring: "ring-slate-300/70",
    rail: "from-slate-400/70 via-slate-300/40 to-transparent",
  },
  queued: {
    border: "border-indigo-500/70",
    surface:
      "bg-[radial-gradient(circle_at_top,_rgba(129,140,248,0.18),rgba(15,23,42,0.98))]",
    ring: "ring-indigo-400/80",
    rail: "from-indigo-400/80 via-indigo-300/40 to-transparent",
  },
  in_progress: {
    border: "border-[color:var(--accent-copper-soft,#fdba74)]",
    surface:
      "bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.28),rgba(15,23,42,0.98))]",
    ring: "ring-[color:var(--accent-copper-soft,#fdba74)]/80",
    rail:
      "from-[color:var(--accent-copper,#f97316)] via-[color:var(--accent-copper-soft,#fdba74)]/60 to-transparent",
  },
  on_hold: {
    border: "border-amber-400/80",
    surface:
      "bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.24),rgba(15,23,42,0.97))]",
    ring: "ring-amber-300/80",
    rail: "from-amber-400 via-amber-300/60 to-transparent",
  },
  planned: {
    border: "border-purple-400/80",
    surface:
      "bg-[radial-gradient(circle_at_top,_rgba(192,132,252,0.20),rgba(15,23,42,0.98))]",
    ring: "ring-purple-300/80",
    rail: "from-purple-400 via-purple-300/60 to-transparent",
  },
  new: {
    border: "border-neutral-700/80",
    surface:
      "bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.12),rgba(15,23,42,0.99))]",
    ring: "ring-neutral-400/80",
    rail: "from-neutral-500 via-neutral-400/60 to-transparent",
  },
  completed: {
    border: "border-teal-400/80",
    surface:
      "bg-[radial-gradient(circle_at_top,_rgba(45,212,191,0.26),rgba(15,23,42,0.97))]",
    ring: "ring-teal-300/80",
    rail: "from-teal-400 via-teal-300/60 to-transparent",
  },
  ready_to_invoice: {
    border: "border-emerald-400/80",
    surface:
      "bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.26),rgba(15,23,42,0.96))]",
    ring: "ring-emerald-300/80",
    rail: "from-emerald-400 via-emerald-300/60 to-transparent",
  },
  invoiced: {
    border: "border-teal-400/85",
    surface:
      "bg-[radial-gradient(circle_at_top,_rgba(45,212,191,0.30),rgba(15,23,42,0.96))]",
    ring: "ring-teal-300/80",
    rail: "from-teal-400 via-teal-300/60 to-transparent",
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
  // Local checks (works even without AI review)
  const localMissingCause = !norm(args.line.cause);
  const localMissingCorrection = !norm(args.line.correction);
  const localMissingComplaint =
    !norm(args.line.complaint) && !norm(args.line.description);
  const localNoParts = args.partsCount === 0;

  const issues = Array.isArray(args.reviewIssues) ? args.reviewIssues : [];

  // If AI issues exist, use them to drive flags (but keep local as fallback)
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
    const hasComplaint =
      k.includes("complaint") ||
      m.includes("complaint") ||
      m.includes("description");
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
  onAddPart,
  pricing,
  reviewIssues,
  reviewOk,
}: JobCardProps): JSX.Element {
  const statusKey = (line.status ?? "awaiting")
    .toLowerCase()
    .replaceAll(" ", "_") as KnownStatus;

  const surfaceCfg = CARD_SURFACE[statusKey] ?? CARD_SURFACE.awaiting;
  const [partsOpen, setPartsOpen] = useState(false);

  const isCompletedLike = (): boolean => {
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

  const handleCardClick = (): void => {
    onOpen();
  };

  const toggleCollapsed = (e: React.MouseEvent<HTMLButtonElement>): void => {
    e.stopPropagation();
    setCollapsed((c) => !c);
  };

  const statusIcon = STATUS_ICON[statusKey] ?? "●";

  const reviewFlags = useMemo(
    () =>
      computeReviewFlags({
        line,
        partsCount,
        reviewIssues,
      }),
    [line, partsCount, reviewIssues],
  );

  const showReviewRow = isCompletedLike();

  return (
    <div
      className={[
        "group relative cursor-pointer overflow-hidden rounded-2xl border p-3 md:p-4 transition-transform duration-150",
        surfaceCfg.border,
        surfaceCfg.surface,
        "shadow-[0_18px_45px_rgba(0,0,0,0.90)] hover:-translate-y-[1px] hover:shadow-[0_26px_60px_rgba(0,0,0,0.95)]",
        isPunchedIn ? `ring-2 ${surfaceCfg.ring}` : "ring-0",
      ].join(" ")}
      title="Open focused job"
      onClick={handleCardClick}
    >
      {/* subtle copper glow on hover */}
      <div className="pointer-events-none absolute inset-0 opacity-0 mix-blend-screen blur-xl transition-opacity duration-150 group-hover:opacity-70">
        <div className="absolute inset-x-10 -top-10 h-32 bg-[radial-gradient(circle,_rgba(249,115,22,0.22),transparent_65%)]" />
      </div>

      <div className="relative z-0 flex gap-3">
        <div className="mt-1 hidden h-[calc(100%-0.5rem)] w-[3px] rounded-full bg-gradient-to-b from-transparent via-white/30 to-transparent opacity-60 sm:block" />

        <div className="relative z-10 min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-start gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="inline-flex h-6 min-w-[1.75rem] items-center justify-center rounded-full border border-white/15 bg-black/40 text-[11px] font-semibold text-neutral-200 shadow-[0_0_12px_rgba(0,0,0,0.8)]">
                  {index + 1}
                </span>
                <div className="truncate text-sm font-semibold text-white">
                  {jobLabel}
                </div>
              </div>

              {canAssign && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAssign?.();
                  }}
                  className="inline-flex items-center gap-1 rounded-full border border-sky-500/70 bg-sky-900/20 px-2.5 py-0.5 text-[11px] font-medium text-sky-100 shadow-[0_0_14px_rgba(8,47,73,0.9)] hover:bg-sky-900/40"
                  title="Assign mechanic to this line"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-sky-300" />
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
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                    isCompletedLike()
                      ? "border-teal-400 bg-teal-900/20 text-teal-100 hover:bg-teal-900/35"
                      : "border-orange-400 bg-orange-900/10 text-orange-100 hover:bg-orange-900/25"
                  }`}
                >
                  {isCompletedLike() ? "View inspection" : "Open inspection"}
                </button>
              )}
            </div>

            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={toggleCollapsed}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-black/40 text-[11px] text-white/80 shadow-[0_0_14px_rgba(0,0,0,0.75)] hover:border-white/25 hover:bg-black/70 hover:text-white"
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

              <span className={statusChip(line.status)}>
                <span className="mr-1">{statusIcon}</span>
                {statusText}
              </span>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddPart?.();
                }}
                className="hidden items-center gap-1 rounded-full border border-white/20 bg-black/35 px-2.5 py-1 text-[11px] font-medium text-white/85 shadow-[0_0_14px_rgba(0,0,0,0.8)] hover:border-[color:var(--accent-copper-soft,#fdba74)]/80 hover:bg-white/5 hover:text-white sm:inline-flex"
                title="Add / use part on this job"
              >
                ＋ <span className="hidden md:inline">Add part</span>
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

          {/* ✅ Review icons row (only after completed-like) */}
          {showReviewRow && (
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
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
                <ReviewIcon
                  tone="warn"
                  title="No parts recorded on this job line"
                  label="⚠ No parts"
                />
              )}
              {reviewFlags.missingComplaint && (
                <ReviewIcon
                  tone="warn"
                  title="Complaint / description is missing"
                  label="⚠ No complaint"
                />
              )}
              {reviewFlags.otherIssues > 0 && (
                <ReviewIcon
                  tone="warn"
                  title="Other review issues exist for this line"
                  label={`⚠ +${reviewFlags.otherIssues}`}
                />
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-300">
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-white/60" />
              {jobTypeText}
            </span>
            <span className="text-neutral-500">•</span>
            <span>Est. labor: {laborText}</span>
            <span className="text-neutral-500">•</span>
            <span className="text-neutral-300/90">
              Status: <span className="capitalize">{statusText}</span>
            </span>
            {isPunchedIn && (
              <>
                <span className="text-neutral-500">•</span>
                <span className="inline-flex items-center gap-1 text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.9)]" />
                  Punched in
                </span>
              </>
            )}
          </div>

          {isCompletedLike() && (
            <div className="text-[10px] text-emerald-200/80">
              {collapsed
                ? "Completed job – use the chevron to view details."
                : "Completed job – use the chevron to collapse details."}
            </div>
          )}

          {!collapsed && (
            <>
              {technicians.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {technicians.map((tech) => (
                    <span
                      key={tech.id}
                      className="inline-flex items-center gap-1 rounded-full bg-sky-900/45 px-2.5 py-0.5 text-[10px] text-sky-100 shadow-[0_0_14px_rgba(8,47,73,0.9)]"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-sky-300" />
                      {tech.full_name ?? "Mechanic"}
                    </span>
                  ))}
                </div>
              )}

              {(line.complaint || line.cause || line.correction) && (
                <div className="mt-1.5 flex flex-wrap items-center gap-2 rounded-lg bg-black/30 px-2 py-1.5 text-[11px] text-neutral-200">
                  {line.complaint && (
                    <span className="font-medium text-neutral-100">
                      Cmpl:{" "}
                      <span className="font-normal text-neutral-300">
                        {line.complaint}
                      </span>
                    </span>
                  )}
                  {line.cause && (
                    <span className="text-neutral-400">
                      | Cause:{" "}
                      <span className="font-normal text-neutral-200">
                        {line.cause}
                      </span>
                    </span>
                  )}
                  {line.correction && (
                    <span className="text-neutral-400">
                      | Corr:{" "}
                      <span className="font-normal text-neutral-200">
                        {line.correction}
                      </span>
                    </span>
                  )}
                </div>
              )}

              <div className="mt-2 rounded-xl border border-white/10 bg-black/40">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPartsOpen((open) => !open);
                  }}
                >
                  <div className="flex flex-col">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-200">
                      Parts used
                    </span>
                    <span className="text-[10px] text-neutral-400">
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
                      className="inline-flex items-center rounded-full border border-white/15 bg-black/35 px-2 py-0.5 text-[11px] font-medium text-white/85 hover:border-white/25 hover:bg-white/5 hover:text-white sm:hidden"
                    >
                      ＋ Part
                    </button>

                    <span
                      className={`text-[10px] text-white/60 transition-transform ${
                        partsOpen ? "rotate-90" : ""
                      }`}
                    >
                      ▶
                    </span>
                  </div>
                </button>

                {partsOpen && (
                  <div
                    className="border-t border-white/10 px-2.5 pb-2 pt-1.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <PartsUsedList allocations={parts} />
                  </div>
                )}
              </div>

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
                      <span className="font-semibold text-[color:var(--accent-copper-light,#fed7aa)]">
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