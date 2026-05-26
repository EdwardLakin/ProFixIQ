"use client";

import { useEffect, useMemo, useState, type JSX, type MouseEvent } from "react";
import { formatDistanceToNow } from "date-fns";
import { ChevronDown, ChevronUp, CircleAlert, CircleCheck, Wrench } from "lucide-react";

import type { Database } from "@shared/types/types/supabase";
import { Button } from "@shared/components/ui/Button";
import Card from "@shared/components/ui/Card";
import { cn } from "@shared/lib/utils";
import { normalizeWorkOrderLineStatus } from "@/features/work-orders/lib/line-status";
import { formatLaborSummary, resolvePrimaryTechDisplay } from "@/features/work-orders/lib/display/linePresentation";

type WorkOrderLine = Database["public"]["Tables"]["work_order_lines"]["Row"];
type WorkOrderPartAllocation =
  Database["public"]["Tables"]["work_order_part_allocations"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

type ReviewIssue = {
  kind?: string | null;
  message?: string | null;
};

type ReviewFlags = {
  missingCause: boolean;
  missingCorrection: boolean;
  missingComplaint: boolean;
  noParts: boolean;
  otherIssues: number;
};

type PricingSummary = {
  laborTotal?: number | null;
  partsTotal?: number | null;
  lineTotal?: number | null;
};

type JobCardProps = {
  index: number;
  line: WorkOrderLine;
  parts: WorkOrderPartAllocation[];
  technicians: Pick<ProfileRow, "id" | "full_name">[];
  canAssign: boolean;
  canDelete?: boolean;
  isPunchedIn: boolean;
  onOpen: () => void;
  onAssign?: (techId: string) => void;
  onPriorityChange?: (priority: JobLinePriority) => void;
  onOpenInspection?: () => void;
  onAddPart?: () => void;
  onDelete?: () => void;
  pricing?: PricingSummary | null;
  reviewIssues?: ReviewIssue[];
  reviewOk?: boolean;
  compact?: boolean;
  selected?: boolean;
  hideExecutionStageCompletenessPills?: boolean;
};

type JobLinePriority = "low" | "normal" | "high" | "urgent";

type StatusVisual = {
  label: string;
  railClass: string;
  chipClass: string;
  orbClass: string;
  borderClass: string;
  glowClass: string;
  muted: boolean;
};

const PRIORITY_OPTIONS: JobLinePriority[] = ["urgent", "high", "normal", "low"];

const PRIORITY_CHIP_STYLES: Record<JobLinePriority, string> = {
  urgent: "border-red-400/50 bg-red-500/10 text-red-100",
  high: "border-amber-400/50 bg-amber-500/10 text-amber-100",
  normal: "border-white/12 bg-black/25 text-neutral-300",
  low: "border-slate-400/45 bg-slate-500/10 text-slate-300",
};

const METALLIC_CARD_SURFACE =
  "bg-[linear-gradient(155deg,rgba(255,255,255,0.07)_0%,rgba(255,255,255,0.02)_18%,rgba(15,23,42,0.82)_54%,rgba(2,6,23,0.96)_100%)]";

function norm(s: unknown): string {
  return String(s ?? "").trim().toLowerCase();
}

function toLinePriority(line: WorkOrderLine): JobLinePriority {
  const raw = norm((line as WorkOrderLine & { job_priority?: string | null }).job_priority);
  if (raw === "urgent" || raw === "high" || raw === "normal" || raw === "low") return raw;
  return "normal";
}

function formatCurrency(value: number | null | undefined): string {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 2,
  }).format(amount);
}

function statusLabelFromKey(status: string): string {
  return status.replaceAll("_", " ").replace(/\b\w/g, (x) => x.toUpperCase());
}

function resolveStatusVisual(status: string | null | undefined, isPunchedIn: boolean): StatusVisual {
  const raw = norm(status).replaceAll("-", "_");
  const normalized = normalizeWorkOrderLineStatus(status);

  if (isPunchedIn || normalized === "in_progress" || raw === "active") {
    return {
      label: "Active",
      railClass: "bg-cyan-400/90",
      chipClass: "border-cyan-300/65 bg-cyan-500/14 text-cyan-100",
      orbClass: "bg-cyan-300",
      borderClass: "border-cyan-400/45",
      glowClass: "shadow-[0_0_22px_rgba(34,211,238,0.25)]",
      muted: false,
    };
  }

  if (normalized === "completed" || normalized === "ready_to_invoice" || normalized === "invoiced") {
    return {
      label: statusLabelFromKey(normalized),
      railClass: "bg-slate-400/75",
      chipClass: "border-slate-400/55 bg-slate-500/10 text-slate-200",
      orbClass: "bg-slate-300",
      borderClass: "border-slate-500/45",
      glowClass: "",
      muted: true,
    };
  }

  if (normalized === "on_hold") {
    return {
      label: "On Hold",
      railClass: "bg-amber-400/90",
      chipClass: "border-amber-300/60 bg-amber-500/12 text-amber-100",
      orbClass: "bg-amber-300",
      borderClass: "border-amber-400/45",
      glowClass: "shadow-[0_0_20px_rgba(251,191,36,0.18)]",
      muted: false,
    };
  }

  if (normalized === "waiting_parts" || raw === "pending_parts") {
    return {
      label: "Waiting Parts",
      railClass: "bg-indigo-400/90",
      chipClass: "border-indigo-300/60 bg-indigo-500/14 text-indigo-100",
      orbClass: "bg-indigo-300",
      borderClass: "border-indigo-400/45",
      glowClass: "shadow-[0_0_20px_rgba(129,140,248,0.18)]",
      muted: false,
    };
  }

  if (normalized === "awaiting_approval" || raw === "needs_approval") {
    return {
      label: "Awaiting Approval",
      railClass: "bg-amber-500/90",
      chipClass: "border-amber-300/60 bg-amber-500/14 text-amber-100",
      orbClass: "bg-amber-300",
      borderClass: "border-amber-500/45",
      glowClass: "shadow-[0_0_20px_rgba(245,158,11,0.2)]",
      muted: false,
    };
  }

  if (raw === "blocked" || raw === "critical" || normalized === "declined" || normalized === "deferred") {
    return {
      label: normalized === "deferred" ? "Deferred" : normalized === "declined" ? "Declined" : "Blocked",
      railClass: "bg-red-400/90",
      chipClass: "border-red-300/60 bg-red-500/12 text-red-100",
      orbClass: "bg-red-300",
      borderClass: "border-red-400/45",
      glowClass: "shadow-[0_0_22px_rgba(248,113,113,0.2)]",
      muted: false,
    };
  }

  if (raw === "queued" || raw === "ready" || normalized === "approved") {
    return {
      label: normalized === "approved" ? "Ready" : statusLabelFromKey(raw),
      railClass: "bg-sky-400/90",
      chipClass: "border-sky-300/60 bg-sky-500/12 text-sky-100",
      orbClass: "bg-sky-300",
      borderClass: "border-sky-400/45",
      glowClass: "shadow-[0_0_20px_rgba(56,189,248,0.16)]",
      muted: false,
    };
  }

  return {
    label: normalized === "pending" ? "Awaiting" : raw ? statusLabelFromKey(raw) : "Awaiting",
    railClass: "bg-sky-500/80",
    chipClass: "border-sky-400/55 bg-sky-500/10 text-sky-100",
    orbClass: "bg-sky-300",
    borderClass: "border-sky-500/40",
    glowClass: "",
    muted: false,
  };
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

function ReviewPill({
  label,
  tone,
  title,
}: {
  label: string;
  tone: "ok" | "warn" | "info";
  title: string;
}) {
  const icon =
    tone === "ok" ? (
      <CircleCheck className="h-3.5 w-3.5" />
    ) : tone === "warn" ? (
      <CircleAlert className="h-3.5 w-3.5" />
    ) : (
      <Wrench className="h-3.5 w-3.5" />
    );

  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em]",
        tone === "ok"
          ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-100"
          : tone === "warn"
            ? "border-amber-400/55 bg-amber-400/10 text-amber-100"
            : "border-white/12 bg-white/5 text-neutral-200",
      )}
    >
      {icon}
      {label}
    </span>
  );
}

function MetaTile({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-3">
      <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">{label}</div>
      <div className="mt-1 text-sm text-neutral-100">{value}</div>
    </div>
  );
}

export function JobCard({
  index,
  line,
  parts,
  technicians,
  canAssign,
  canDelete,
  isPunchedIn,
  onOpen,
  onAssign,
  onPriorityChange,
  onOpenInspection,
  onAddPart,
  onDelete,
  pricing,
  reviewIssues,
  reviewOk,
  compact = false,
  selected = false,
  hideExecutionStageCompletenessPills = false,
}: JobCardProps): JSX.Element {
  const [collapsed, setCollapsed] = useState<boolean>(false);

  const statusVisual = useMemo(
    () => resolveStatusVisual(line.status, isPunchedIn),
    [line.status, isPunchedIn],
  );

  const isCompletedLike = statusVisual.muted;
  const isActiveLine = statusVisual.label === "Active";

  useEffect(() => {
    setCollapsed(isCompletedLike);
  }, [isCompletedLike]);

  const jobLabel = line.description || line.complaint || "Untitled job";
  const assignedTech = useMemo(() => {
    const techId = line.assigned_tech_id;
    const profile = technicians.find((tech) => tech.id === techId) ?? null;
    return resolvePrimaryTechDisplay(line, profile ? { ...profile, role: "tech" } : null);
  }, [line.assigned_tech_id, technicians]);

  const linePriority = toLinePriority(line);
  const quietPriority = linePriority === "urgent" || linePriority === "high" ? linePriority : null;

  const reviewFlags = computeReviewFlags({
    line,
    partsCount: parts.length,
    reviewIssues,
  });

  const createdLabel = line.created_at
    ? formatDistanceToNow(new Date(line.created_at), { addSuffix: true })
    : "—";

  const updatedLabel = line.updated_at
    ? formatDistanceToNow(new Date(line.updated_at), { addSuffix: true })
    : "—";

  const lineTotal =
    pricing?.lineTotal ?? (Number(pricing?.laborTotal ?? 0) + Number(pricing?.partsTotal ?? 0));

  const isBlocked = norm(line.status) === "on_hold" || norm(line.status) === "blocked";
  const waitingApproval = norm(line.approval_state) === "pending";

  const showDeleteAction = canDelete === true && typeof onDelete === "function";

  const handleDeleteActionClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onDelete?.();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      className="outline-none"
      aria-label={`Open job ${index + 1}: ${jobLabel}`}
      aria-pressed={selected}
    >
      <Card
        className={cn(
          "relative overflow-hidden border p-0 transition",
          METALLIC_CARD_SURFACE,
          statusVisual.borderClass,
          statusVisual.glowClass,
          statusVisual.muted && "border-slate-600/35 opacity-[0.74] saturate-[0.56] contrast-[0.9]",
          "hover:-translate-y-[1px] hover:border-white/25",
          "focus-within:border-white/35",
          selected && "border-white/35 shadow-[0_0_0_1px_rgba(148,163,184,0.45)]",
        )}
      >
        <div className={cn("absolute inset-y-0 left-0 w-1.5", statusVisual.railClass, statusVisual.muted && "opacity-75")} />

        <div className={cn("relative pl-5", compact ? "p-3" : "p-4")}>
          <div className={cn("flex flex-col", compact ? "gap-2" : "gap-3")}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full border border-white/12 bg-black/35 px-2 text-xs font-semibold text-neutral-100">
                    {index + 1}
                  </span>
                  <h3 className={cn("truncate font-semibold text-white", compact ? "text-sm sm:text-[15px]" : "text-[15px] sm:text-base")}>
                    {jobLabel}
                  </h3>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]",
                      statusVisual.chipClass,
                      isActiveLine &&
                        "shadow-[0_0_18px_rgba(103,232,249,0.28)] [animation:pulse_2.6s_ease-in-out_infinite]",
                      statusVisual.muted && "text-slate-300",
                    )}
                  >
                    {statusVisual.label}
                  </span>
                  {isPunchedIn ? (
                    <span
                      className={cn(
                        "inline-flex h-2.5 w-2.5 animate-pulse rounded-full",
                        statusVisual.orbClass,
                      )}
                      title="Active labor session"
                    />
                  ) : null}
                  {quietPriority ? (
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em]",
                        PRIORITY_CHIP_STYLES[quietPriority],
                      )}
                    >
                      {quietPriority}
                    </span>
                  ) : null}
                </div>

                <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">
                  Created {createdLabel}
                </p>
              </div>

              <div className={cn("flex flex-wrap items-center", compact ? "gap-1" : "gap-1.5", statusVisual.muted && "opacity-80")}>
                <Button type="button" variant={selected ? "secondary" : "outline"} size="sm" onClick={onOpen}>
                  Open
                </Button>

                {onOpenInspection ? (
                  <Button type="button" variant="secondary" size="sm" onClick={onOpenInspection}>
                    Inspection
                  </Button>
                ) : null}

                {onAddPart ? (
                  <Button type="button" variant="secondary" size="sm" onClick={onAddPart}>
                    Add Part
                  </Button>
                ) : null}

                {showDeleteAction ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleDeleteActionClick}
                  >
                    Delete / Void
                  </Button>
                ) : null}

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setCollapsed((v) => !v)}
                  className={cn("border border-white/10 bg-black/20", compact && "px-2")}
                >
                  {collapsed ? (
                    <>
                      Expand <ChevronDown className="ml-1 h-4 w-4" />
                    </>
                  ) : (
                    <>
                      Collapse <ChevronUp className="ml-1 h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </div>

            <div className={cn("flex flex-wrap", compact ? "gap-1" : "gap-1.5", statusVisual.muted && "opacity-85")}>
              {!hideExecutionStageCompletenessPills && reviewFlags.missingCause ? (
                <ReviewPill tone="warn" label="Cause Missing" title="Cause completeness" />
              ) : null}
              {!hideExecutionStageCompletenessPills && reviewFlags.missingCorrection ? (
                <ReviewPill tone="warn" label="Correction Missing" title="Correction completeness" />
              ) : null}
              {!hideExecutionStageCompletenessPills && reviewFlags.noParts ? (
                <ReviewPill tone="warn" label="No Parts" title="Parts completeness" />
              ) : null}
              {isBlocked ? <ReviewPill tone="warn" label="Blocked" title="Line currently blocked or on hold" /> : null}
              {waitingApproval ? (
                <ReviewPill tone="info" label="Awaiting Approval" title="Waiting for approval decision" />
              ) : null}
              {reviewFlags.missingComplaint ? (
                <ReviewPill tone="info" label="Complaint Missing" title="Complaint / description completeness" />
              ) : null}
              {reviewFlags.otherIssues > 0 ? (
                <ReviewPill tone="info" label={`${reviewFlags.otherIssues} Other`} title="Additional review issues" />
              ) : null}
              {reviewOk ? <ReviewPill tone="ok" label="Review Ready" title="Review checks are clear" /> : null}
            </div>

            {!collapsed ? (
              <>
                <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-4">
                  <MetaTile label="Assigned Tech" value={assignedTech} />
                  <MetaTile
                    label="Labor"
                    value={formatLaborSummary(line.labor_time, Number(pricing?.laborTotal ?? 0))}
                  />
                  <MetaTile label="Parts" value={String(parts.length)} />
                  <MetaTile label="Line Total" value={lineTotal > 0 ? formatCurrency(lineTotal) : "Estimate pending"} />
                </div>

                {(line.complaint || line.cause || line.correction || line.hold_reason) ? (
                  <div className="rounded-xl border border-white/10 bg-black/25 p-3 text-xs text-neutral-300">
                    {line.complaint ? <div>Complaint: {line.complaint}</div> : null}
                    {line.cause ? <div>Cause: {line.cause}</div> : null}
                    {line.correction ? <div>Correction: {line.correction}</div> : null}
                    {line.hold_reason ? <div>Blocker: {line.hold_reason}</div> : null}
                    <div className="mt-2 text-[11px] text-neutral-500">Updated {updatedLabel}</div>
                  </div>
                ) : null}

                {canAssign && onAssign ? (
                  <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">Assign technician</div>

                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {technicians.length === 0 ? (
                        <span className="text-sm text-neutral-400">No technicians available.</span>
                      ) : (
                        technicians.map((tech) => {
                          const isAssigned = tech.id === line.assigned_tech_id;

                          return (
                            <button
                              key={tech.id}
                              type="button"
                              onClick={() => onAssign(tech.id)}
                              className={cn(
                                "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                                isAssigned
                                  ? "border-cyan-300/50 bg-cyan-500/10 text-cyan-100"
                                  : "border-white/10 bg-white/5 text-neutral-200 hover:border-white/20 hover:bg-white/10",
                              )}
                            >
                              {tech.full_name || "Unnamed tech"}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                ) : null}

                {onPriorityChange ? (
                  <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">Job priority</div>
                    <select
                      className="mt-2 w-full rounded-lg border border-white/15 bg-black/40 px-2.5 py-1.5 text-sm text-neutral-100"
                      value={linePriority}
                      onChange={(event) => onPriorityChange(event.target.value as JobLinePriority)}
                    >
                      {PRIORITY_OPTIONS.map((priority) => (
                        <option key={priority} value={priority}>
                          {priority[0].toUpperCase() + priority.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </Card>
    </div>
  );
}

export default JobCard;
