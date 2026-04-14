"use client";

import { useEffect, useMemo, useState, type JSX } from "react";
import { formatDistanceToNow } from "date-fns";
import { ChevronDown, ChevronUp, CircleAlert, CircleCheck, Wrench } from "lucide-react";

import type { Database } from "@shared/types/types/supabase";
import { Button } from "@shared/components/ui/Button";
import Card from "@shared/components/ui/Card";
import StatusBadge from "@shared/components/ui/StatusBadge";
import { cn } from "@shared/lib/utils";

type WorkOrderLine = Database["public"]["Tables"]["work_order_lines"]["Row"];
type WorkOrderPartAllocation =
  Database["public"]["Tables"]["work_order_part_allocations"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

type KnownStatus =
  | "awaiting"
  | "in_progress"
  | "on_hold"
  | "completed"
  | "ready_to_invoice"
  | "invoiced";

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
  onOpenInspection?: () => void;
  onAddPart?: () => void;
  onDelete?: () => void;
  pricing?: PricingSummary | null;
  reviewIssues?: ReviewIssue[];
  reviewOk?: boolean;
  compact?: boolean;
  selected?: boolean;
};

const CARD_SURFACE: Record<
  KnownStatus,
  {
    badgeVariant: "info" | "active" | "warning" | "success";
    surfaceClass: string;
    label: string;
  }
> = {
  awaiting: {
    badgeVariant: "info",
    surfaceClass:
      "bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.12),rgba(10,10,10,0.96))]",
    label: "Awaiting",
  },
  in_progress: {
    badgeVariant: "active",
    surfaceClass:
      "bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.18),rgba(10,10,10,0.96))]",
    label: "In Progress",
  },
  on_hold: {
    badgeVariant: "warning",
    surfaceClass:
      "bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.14),rgba(10,10,10,0.96))]",
    label: "On Hold",
  },
  completed: {
    badgeVariant: "success",
    surfaceClass:
      "bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.14),rgba(10,10,10,0.96))]",
    label: "Completed",
  },
  ready_to_invoice: {
    badgeVariant: "success",
    surfaceClass:
      "bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.14),rgba(10,10,10,0.96))]",
    label: "Ready to Invoice",
  },
  invoiced: {
    badgeVariant: "success",
    surfaceClass:
      "bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.14),rgba(10,10,10,0.96))]",
    label: "Invoiced",
  },
};

function statusRailTone(args: {
  status: string | null;
  holdReason: string | null;
  approvalState: string | null;
  reviewFlags: ReviewFlags;
}): "healthy" | "needs" | "blocked" {
  const status = norm(args.status);
  const hold = norm(args.holdReason);
  const approval = norm(args.approvalState);

  if (
    status === "on_hold" ||
    status === "declined" ||
    hold.includes("block") ||
    hold.includes("part") ||
    hold.includes("urgent")
  ) {
    return "blocked";
  }

  if (
    approval === "pending" ||
    args.reviewFlags.missingCause ||
    args.reviewFlags.missingComplaint ||
    args.reviewFlags.missingCorrection ||
    args.reviewFlags.noParts
  ) {
    return "needs";
  }

  return "healthy";
}

function norm(s: unknown): string {
  return String(s ?? "").trim().toLowerCase();
}

function formatCurrency(value: number | null | undefined): string {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 2,
  }).format(amount);
}

function computeReviewFlags(args: {
  line: WorkOrderLine;
  partsCount: number;
  reviewIssues?: ReviewIssue[];
}): ReviewFlags {
  const localMissingCause = !norm(args.line.cause);
  const localMissingCorrection = !norm(args.line.correction);
  const localMissingComplaint =
    !norm(args.line.complaint) &&
    !norm(args.line.description);
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
          ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-100"
          : tone === "warn"
            ? "border-amber-400/60 bg-amber-400/10 text-amber-100"
            : "border-white/10 bg-white/5 text-neutral-200",
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
      <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">
        {label}
      </div>
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
  onOpenInspection,
  onAddPart,
  onDelete,
  pricing,
  reviewIssues,
  reviewOk,
  compact = false,
  selected = false,
}: JobCardProps): JSX.Element {
  const rawStatus = (line.status ?? "awaiting")
    .toLowerCase()
    .replaceAll(" ", "_");

  const statusKey = (
    isPunchedIn
      ? "in_progress"
      : rawStatus === "in-progress"
        ? "in_progress"
        : rawStatus
  ) as KnownStatus;

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
  const assignedTech = useMemo(() => {
    const techId = line.assigned_tech_id;
    return technicians.find((tech) => tech.id === techId)?.full_name || "Unassigned";
  }, [line.assigned_tech_id, technicians]);

  const reviewFlags = computeReviewFlags({
    line,
    partsCount: parts.length,
    reviewIssues,
  });
  const railTone = statusRailTone({
    status: line.status,
    holdReason: line.hold_reason,
    approvalState: line.approval_state,
    reviewFlags,
  });

  const createdLabel = line.created_at
    ? formatDistanceToNow(new Date(line.created_at), { addSuffix: true })
    : "—";

  const lineTotal =
    pricing?.lineTotal ??
    (Number(pricing?.laborTotal ?? 0) + Number(pricing?.partsTotal ?? 0));

  void canDelete;
  void onDelete;

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
        "relative overflow-hidden p-0",
        "transition hover:-translate-y-[1px] hover:border-[color:var(--accent-copper-soft,#fdba74)]",
        "focus-within:border-[color:var(--accent-copper-light,#fdba74)] focus-within:shadow-[0_0_0_1px_rgba(253,186,116,0.55),0_10px_30px_rgba(249,115,22,0.18)]",
        selected &&
          "scale-[1.01] border-[color:var(--accent-copper-light,#fdba74)] bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.2),rgba(10,10,10,0.96))] shadow-[0_0_0_1px_rgba(253,186,116,0.7),0_12px_34px_rgba(249,115,22,0.24)]",
        surfaceCfg.surfaceClass,
      )}
      >
        <div
          className={cn(
            "absolute inset-y-0 left-0 w-1",
            railTone === "healthy"
              ? "bg-emerald-400/90"
              : railTone === "needs"
                ? "bg-amber-400/90"
                : "bg-red-400/90",
          )}
        />

        <div className={cn("relative pl-5", compact ? "p-3" : "p-4")}>
          <div className={cn("flex flex-col", compact ? "gap-2" : "gap-3")}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge variant={surfaceCfg.badgeVariant}>
                  {surfaceCfg.label}
                </StatusBadge>
                <StatusBadge variant={isPunchedIn ? "active" : "neutral"}>
                  {isPunchedIn ? "Punched In" : "Not Punched In"}
                </StatusBadge>
                {reviewOk ? (
                  <StatusBadge variant="success">Review Ready</StatusBadge>
                ) : null}
              </div>

              <div className={cn("flex items-start gap-2.5", compact ? "mt-1.5" : "mt-2")}>
                <div className={cn("flex shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-xs font-semibold text-neutral-200", compact ? "h-6 w-6" : "h-8 w-8")}>
                  {index + 1}
                </div>

                <div className="min-w-0">
                  <h3 className={cn("font-semibold text-white", compact ? "text-sm sm:text-[15px]" : "text-[15px] sm:text-base")}>
                    {jobLabel}
                  </h3>
                  <p className={cn("text-xs uppercase tracking-[0.16em] text-neutral-500", compact ? "mt-0.5" : "mt-1")}>
                    Created {createdLabel}
                  </p>
                </div>
              </div>
            </div>

            <div className={cn("flex flex-wrap items-center", compact ? "gap-1" : "gap-1.5")}>
              <Button type="button" variant={selected ? "secondary" : "outline"} size="sm" onClick={onOpen}>
                Open
              </Button>

              {onOpenInspection ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={onOpenInspection}
                >
                  Inspection
                </Button>
              ) : null}

              {onAddPart ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={onAddPart}
                >
                  Add Part
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

          <div className={cn("flex flex-wrap", compact ? "gap-1" : "gap-1.5")}>
            {reviewFlags.missingComplaint ? (
              <ReviewPill tone="warn" label="Complaint missing" title="Complaint / description completeness" />
            ) : null}
            {reviewFlags.missingCause ? (
              <ReviewPill tone="warn" label="Cause missing" title="Cause completeness" />
            ) : null}
            {reviewFlags.missingCorrection ? (
              <ReviewPill tone="warn" label="Correction missing" title="Correction completeness" />
            ) : null}
            {reviewFlags.noParts ? (
              <ReviewPill tone="warn" label="No parts" title="Parts completeness" />
            ) : null}
            {norm(line.status) === "on_hold" ? (
              <ReviewPill tone="warn" label="Blocked" title="Line currently blocked or on hold" />
            ) : null}
            {norm(line.approval_state) === "pending" ? (
              <ReviewPill tone="info" label="Waiting approval" title="Waiting for approval decision" />
            ) : null}
            {reviewFlags.otherIssues > 0 ? (
              <ReviewPill
                tone="info"
                label={`${reviewFlags.otherIssues} other`}
                title="Additional review issues"
              />
            ) : null}
          </div>

          {!collapsed ? (
            <>
              <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-4">
                <MetaTile label="Assigned Tech" value={assignedTech} />
                <MetaTile label="Parts" value={String(parts.length)} />
                <MetaTile
                  label="Labor"
                  value={formatCurrency(pricing?.laborTotal ?? 0)}
                />
                <MetaTile label="Line Total" value={formatCurrency(lineTotal)} />
              </div>

              {canAssign && onAssign ? (
                <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">
                    Assign technician
                  </div>

                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {technicians.length === 0 ? (
                      <span className="text-sm text-neutral-400">
                        No technicians available.
                      </span>
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
                                ? "border-[color:var(--accent-copper-soft,#fdba74)] bg-[color:var(--accent-copper,#f97316)]/15 text-[color:var(--accent-copper-light,#fdba74)]"
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
            </>
          ) : null}
        </div>
        </div>
      </Card>
    </div>
  );
}

export default JobCard;
