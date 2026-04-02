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
};

const CARD_SURFACE: Record<
  KnownStatus,
  {
    badgeVariant: "info" | "active" | "warning" | "success";
    railClass: string;
    surfaceClass: string;
    label: string;
  }
> = {
  awaiting: {
    badgeVariant: "info",
    railClass: "bg-slate-400/80",
    surfaceClass:
      "bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.12),rgba(10,10,10,0.96))]",
    label: "Awaiting",
  },
  in_progress: {
    badgeVariant: "active",
    railClass:
      "bg-[linear-gradient(180deg,var(--accent-copper,#f97316),var(--accent-copper-light,#fdba74))]",
    surfaceClass:
      "bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.18),rgba(10,10,10,0.96))]",
    label: "In Progress",
  },
  on_hold: {
    badgeVariant: "warning",
    railClass: "bg-amber-400/85",
    surfaceClass:
      "bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.14),rgba(10,10,10,0.96))]",
    label: "On Hold",
  },
  completed: {
    badgeVariant: "success",
    railClass: "bg-emerald-400/85",
    surfaceClass:
      "bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.14),rgba(10,10,10,0.96))]",
    label: "Completed",
  },
  ready_to_invoice: {
    badgeVariant: "success",
    railClass: "bg-emerald-400/85",
    surfaceClass:
      "bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.14),rgba(10,10,10,0.96))]",
    label: "Ready to Invoice",
  },
  invoiced: {
    badgeVariant: "success",
    railClass: "bg-emerald-400/85",
    surfaceClass:
      "bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.14),rgba(10,10,10,0.96))]",
    label: "Invoiced",
  },
};

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
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]",
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
  const assignedTech = useMemo(() => {
    const techId = line.assigned_tech_id;
    return technicians.find((tech) => tech.id === techId)?.full_name || "Unassigned";
  }, [line.assigned_tech_id, technicians]);

  const reviewFlags = computeReviewFlags({
    line,
    partsCount: parts.length,
    reviewIssues,
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
    <Card
      className={cn(
        "relative overflow-hidden p-0",
        "transition hover:-translate-y-[1px] hover:border-[color:var(--accent-copper-soft,#fdba74)]",
        surfaceCfg.surfaceClass,
      )}
    >
      <div className={cn("absolute inset-y-0 left-0 w-1", surfaceCfg.railClass)} />

      <div className="relative p-5 pl-6">
        <div className="flex flex-col gap-4">
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

              <div className="mt-3 flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-xs font-semibold text-neutral-200">
                  {index + 1}
                </div>

                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-white sm:text-lg">
                    {jobLabel}
                  </h3>
                  <p className="mt-1 text-xs uppercase tracking-[0.16em] text-neutral-500">
                    Created {createdLabel}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={onOpen}>
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
                className="border border-white/10 bg-black/20"
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

          <div className="flex flex-wrap gap-2">
            <ReviewPill
              tone={reviewFlags.missingComplaint ? "warn" : "ok"}
              label={reviewFlags.missingComplaint ? "Complaint missing" : "Complaint ok"}
              title="Complaint / description completeness"
            />
            <ReviewPill
              tone={reviewFlags.missingCause ? "warn" : "ok"}
              label={reviewFlags.missingCause ? "Cause missing" : "Cause ok"}
              title="Cause completeness"
            />
            <ReviewPill
              tone={reviewFlags.missingCorrection ? "warn" : "ok"}
              label={reviewFlags.missingCorrection ? "Correction missing" : "Correction ok"}
              title="Correction completeness"
            />
            <ReviewPill
              tone={reviewFlags.noParts ? "warn" : "ok"}
              label={reviewFlags.noParts ? "No parts" : "Parts added"}
              title="Parts completeness"
            />
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
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <MetaTile label="Assigned Tech" value={assignedTech} />
                <MetaTile label="Parts" value={String(parts.length)} />
                <MetaTile
                  label="Labor"
                  value={formatCurrency(pricing?.laborTotal ?? 0)}
                />
                <MetaTile label="Line Total" value={formatCurrency(lineTotal)} />
              </div>

              {canAssign && onAssign ? (
                <div className="rounded-xl border border-white/10 bg-black/25 p-4">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">
                    Assign technician
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
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
  );
}

export default JobCard;
