"use client";

import { useEffect, useMemo, useState, type JSX, type MouseEvent } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  ChevronDown,
  ChevronUp,
  CircleAlert,
  CircleCheck,
  PackagePlus,
  UserRound,
  Wrench,
} from "lucide-react";

import type { Database } from "@shared/types/types/supabase";
import { Button } from "@shared/components/ui/Button";
import Card from "@shared/components/ui/Card";
import { cn } from "@shared/lib/utils";
import { normalizeWorkOrderLineStatus } from "@/features/work-orders/lib/line-status";
import {
  formatLaborSummary,
  formatPartsSummary,
  resolvePrimaryTechDisplay,
} from "@/features/work-orders/lib/display/linePresentation";
import JobEvidenceStrip from "@/features/work-orders/components/evidence/JobEvidenceStrip";
import type { WorkOrderEvidenceItem } from "@/features/work-orders/lib/evidence/workOrderEvidence";

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
  laborHours?: number | null;
  laborTotal?: number | null;
  partsTotal?: number | null;
  lineTotal?: number | null;
};

type JobCardProps = {
  index: number;
  line: WorkOrderLine;
  parts: WorkOrderPartAllocation[];
  partsCount?: number;
  partsStatusLabel?: string | null;
  technicians: Pick<ProfileRow, "id" | "full_name">[];
  canAssign: boolean;
  canDelete?: boolean;
  isPunchedIn: boolean;
  isCurrentUserWorkingThisLine?: boolean;
  activeTechnicianNames?: string[];
  isSelectedForPanel?: boolean;
  onOpen: () => void;
  onAssign?: (techId: string) => void;
  onOpenInspection?: () => void;
  onAddPart?: () => void;
  onRequestParts?: () => void;
  requestPartsLabel?: string;
  requestPartsBusy?: boolean;
  onDelete?: () => void;
  pricing?: PricingSummary | null;
  reviewIssues?: ReviewIssue[];
  reviewOk?: boolean;
  compact?: boolean;
  display?: "card" | "navigator";
  selected?: boolean;
  hideExecutionStageCompletenessPills?: boolean;
  evidence?: WorkOrderEvidenceItem[];
};

type StatusVisual = {
  label: string | null;
  railClass: string;
  chipClass: string;
  borderClass: string;
  glowClass: string;
  muted: boolean;
};

const METALLIC_CARD_SURFACE = "bg-[var(--theme-gradient-panel)]";
const btnLikeNavigatorAction =
  "inline-flex min-h-8 items-center justify-center rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2 py-1.5 text-[10px] font-semibold text-[color:var(--theme-text-primary)] transition hover:bg-[color:var(--theme-surface-subtle)] disabled:cursor-not-allowed disabled:opacity-50";

function norm(s: unknown): string {
  return String(s ?? "")
    .trim()
    .toLowerCase();
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

function resolveStatusVisual(status: string | null | undefined): StatusVisual {
  const raw = norm(status).replaceAll("-", "_");
  const normalized = normalizeWorkOrderLineStatus(status);

  if (normalized === "in_progress" || raw === "active") {
    return {
      label: null,
      railClass: "bg-[color:var(--theme-surface-subtle)]",
      chipClass:
        "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] text-[color:var(--theme-text-primary)]",
      borderClass: "border-[color:var(--theme-border-soft)]",
      glowClass: "",
      muted: false,
    };
  }

  if (
    normalized === "completed" ||
    normalized === "ready_to_invoice" ||
    normalized === "invoiced"
  ) {
    return {
      label: statusLabelFromKey(normalized),
      railClass: "bg-[color:var(--theme-surface-subtle)]",
      chipClass:
        "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] text-[color:var(--theme-text-primary)]",
      borderClass: "border-[color:var(--theme-border-soft)]",
      glowClass: "",
      muted: true,
    };
  }

  if (normalized === "on_hold") {
    return {
      label: "On Hold",
      railClass: "bg-amber-400/90",
      chipClass: "border-amber-300/60 bg-amber-500/12 text-amber-100",
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
      borderClass: "border-amber-500/45",
      glowClass: "shadow-[0_0_20px_rgba(245,158,11,0.2)]",
      muted: false,
    };
  }

  if (
    raw === "blocked" ||
    raw === "critical" ||
    normalized === "declined" ||
    normalized === "deferred"
  ) {
    return {
      label:
        normalized === "deferred"
          ? "Deferred"
          : normalized === "declined"
            ? "Declined"
            : "Blocked",
      railClass: "bg-red-400/90",
      chipClass: "border-red-300/60 bg-red-500/12 text-red-100",
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
      borderClass: "border-sky-400/45",
      glowClass: "shadow-[0_0_20px_rgba(56,189,248,0.16)]",
      muted: false,
    };
  }

  return {
    label:
      normalized === "pending"
        ? "Awaiting"
        : raw
          ? statusLabelFromKey(raw)
          : "Awaiting",
    railClass: "bg-sky-500/80",
    chipClass: "border-sky-400/55 bg-sky-500/10 text-sky-100",
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
  const localMissingComplaint =
    !norm(args.line.complaint) && !norm(args.line.description);
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
            : "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] text-[color:var(--theme-text-primary)]",
      )}
    >
      {icon}
      {label}
    </span>
  );
}

function MetaTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-3">
      <div className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
        {label}
      </div>
      <div className="mt-1 text-sm text-[color:var(--theme-text-primary)]">
        {value}
      </div>
    </div>
  );
}

export function JobCard({
  index,
  line,
  parts,
  partsCount,
  partsStatusLabel,
  technicians,
  canAssign,
  canDelete,
  isPunchedIn,
  isCurrentUserWorkingThisLine = false,
  activeTechnicianNames = [],
  isSelectedForPanel,
  onOpen,
  onAssign,
  onOpenInspection,
  onAddPart,
  onRequestParts,
  requestPartsLabel = "Request all parts",
  requestPartsBusy = false,
  onDelete,
  pricing,
  reviewIssues,
  reviewOk,
  compact = false,
  display = "card",
  selected = false,
  hideExecutionStageCompletenessPills = false,
  evidence = [],
}: JobCardProps): JSX.Element {
  const [collapsed, setCollapsed] = useState<boolean>(false);

  const statusVisual = useMemo(
    () => resolveStatusVisual(line.status),
    [line.status],
  );

  const isCompletedLike = statusVisual.muted;
  const isSelected = isSelectedForPanel ?? selected;
  const activeTechCount = activeTechnicianNames.length;
  const activeTechName = activeTechnicianNames[0] ?? null;
  const liveMarkerLabel = isPunchedIn
    ? isCurrentUserWorkingThisLine
      ? "WORKING NOW"
      : activeTechCount > 1
        ? `${activeTechCount} TECHS ACTIVE`
        : activeTechName
          ? `TECH ACTIVE · ${activeTechName}`
          : "TECH ACTIVE"
    : null;

  useEffect(() => {
    setCollapsed(isCompletedLike);
  }, [isCompletedLike]);

  const jobLabel = line.description || line.complaint || "Untitled job";
  const assignedTech = useMemo(() => {
    const techId = line.assigned_tech_id;
    const profile = technicians.find((tech) => tech.id === techId) ?? null;
    return resolvePrimaryTechDisplay(
      line,
      profile ? { ...profile, role: "tech" } : null,
    );
  }, [line, technicians]);

  const effectivePartsCount = Math.max(
    parts.length,
    partsCount ?? 0,
    Number(pricing?.partsTotal ?? 0) > 0 ? 1 : 0,
  );

  const reviewFlags = computeReviewFlags({
    line,
    partsCount: effectivePartsCount,
    reviewIssues,
  });

  const createdLabel = line.created_at
    ? formatDistanceToNow(new Date(line.created_at), { addSuffix: true })
    : "—";

  const updatedLabel = line.updated_at
    ? formatDistanceToNow(new Date(line.updated_at), { addSuffix: true })
    : "—";

  const lineTotal =
    pricing?.lineTotal ??
    Number(pricing?.laborTotal ?? 0) + Number(pricing?.partsTotal ?? 0);

  const isBlocked =
    norm(line.status) === "on_hold" || norm(line.status) === "blocked";
  const waitingApproval = norm(line.approval_state) === "pending";

  const showDeleteAction = canDelete === true && typeof onDelete === "function";

  const handleDeleteActionClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onDelete?.();
  };

  const handleAddPartClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onAddPart?.();
  };

  const handleRequestPartsClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onRequestParts?.();
  };

  if (display === "navigator") {
    return (
      <article
        className={cn(
          "border-b border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] transition",
          isSelected
            ? "border-l-[3px] border-l-[color:var(--brand-primary)] bg-[color:var(--theme-surface-subtle)]"
            : "border-l-[3px] border-l-transparent hover:bg-[color:var(--theme-surface-subtle)]",
          statusVisual.muted && "opacity-75",
        )}
      >
        <button
          type="button"
          onClick={onOpen}
          className="w-full px-3 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--brand-primary)]"
          aria-label={`Open job ${index + 1}: ${jobLabel}`}
          aria-pressed={isSelected}
        >
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-1.5 text-[11px] font-semibold text-[color:var(--theme-text-primary)]">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="line-clamp-2 text-sm font-semibold leading-5 text-[color:var(--theme-text-primary)]">
                {jobLabel}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {statusVisual.label ? (
                  <span
                    className={cn(
                      "inline-flex rounded-md border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em]",
                      statusVisual.chipClass,
                    )}
                  >
                    {statusVisual.label}
                  </span>
                ) : null}
                {liveMarkerLabel ? (
                  <span className="inline-flex rounded-md border border-cyan-300/50 bg-cyan-400/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-cyan-100">
                    {liveMarkerLabel}
                  </span>
                ) : null}
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-[color:var(--theme-text-secondary)]">
                <span className="inline-flex min-w-0 items-center gap-1 truncate">
                  <UserRound className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{assignedTech}</span>
                </span>
                <span className="shrink-0 font-mono font-semibold text-[color:var(--theme-text-primary)]">
                  {lineTotal > 0 ? formatCurrency(lineTotal) : "Estimate pending"}
                </span>
              </div>
            </div>
          </div>
        </button>

        {isSelected ? (
          <div className="border-t border-[color:var(--theme-border-soft)] px-3 py-2">
            {canAssign && onAssign ? (
              <label className="relative mb-2 block">
                <UserRound className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-[color:var(--theme-text-muted)]" />
                <span className="sr-only">Assigned technician</span>
                <select
                  aria-label="Assigned technician"
                  value={line.assigned_tech_id ?? ""}
                  onChange={(event) => onAssign(event.target.value)}
                  className="h-8 w-full appearance-none truncate rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] py-1 pl-7 pr-3 text-[10px] font-semibold text-[color:var(--theme-text-primary)]"
                >
                  <option value="" disabled>
                    Unassigned
                  </option>
                  {technicians.map((tech) => (
                    <option key={tech.id} value={tech.id}>
                      {tech.full_name || "Unnamed tech"}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <details className="group">
              <summary className="cursor-pointer list-none text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)] hover:text-[color:var(--theme-text-primary)]">
                Job actions
              </summary>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {onOpenInspection ? (
                  <button type="button" className={btnLikeNavigatorAction} onClick={onOpenInspection}>
                    Inspection
                  </button>
                ) : null}
                {onAddPart ? (
                  <button type="button" className={btnLikeNavigatorAction} onClick={onAddPart}>
                    Add part
                  </button>
                ) : null}
                {onRequestParts ? (
                  <button
                    type="button"
                    className={btnLikeNavigatorAction}
                    onClick={onRequestParts}
                    disabled={requestPartsBusy}
                  >
                    {requestPartsBusy ? "Requesting…" : requestPartsLabel}
                  </button>
                ) : null}
                {showDeleteAction ? (
                  <button type="button" className={btnLikeNavigatorAction} onClick={onDelete}>
                    Delete / Void
                  </button>
                ) : null}
              </div>
            </details>
          </div>
        ) : null}
      </article>
    );
  }

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
      aria-pressed={isSelected}
    >
      <Card
        className={cn(
          "relative overflow-hidden border p-0 transition",
          METALLIC_CARD_SURFACE,
          isPunchedIn
            ? "border-cyan-300/70 shadow-[0_0_28px_rgba(34,211,238,0.24)]"
            : statusVisual.borderClass,
          !isPunchedIn && statusVisual.glowClass,
          isPunchedIn && "[animation:pulse_3.2s_ease-in-out_infinite]",
          statusVisual.muted &&
            "border-[color:var(--theme-border-soft)] opacity-[0.74] saturate-[0.56] contrast-[0.9]",
          "hover:-translate-y-[1px] hover:border-[color:var(--theme-border-soft)]",
          "focus-within:border-[color:var(--theme-border-soft)]",
          isSelected &&
            !isPunchedIn &&
            "border-[color:var(--theme-border-soft)] shadow-[0_0_0_1px_rgba(148,163,184,0.45)]",
          isSelected &&
            isPunchedIn &&
            "shadow-[0_0_0_1px_rgba(226,232,240,0.38),0_0_28px_rgba(34,211,238,0.24)]",
        )}
      >
        <div
          className={cn(
            "absolute inset-y-0 left-0",
            isPunchedIn ? "w-2 bg-cyan-300" : "w-1.5",
            !isPunchedIn && statusVisual.railClass,
            statusVisual.muted && "opacity-75",
          )}
        />

        <div className={cn("relative pl-5", compact ? "p-3" : "p-4")}>
          <div className={cn("flex flex-col", compact ? "gap-2" : "gap-3")}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2 text-xs font-semibold text-[color:var(--theme-text-primary)]">
                    {index + 1}
                  </span>
                  <h3
                    className={cn(
                      "truncate font-semibold text-[color:var(--theme-text-primary)]",
                      compact
                        ? "text-sm sm:text-[15px]"
                        : "text-[15px] sm:text-base",
                    )}
                  >
                    {jobLabel}
                  </h3>
                  {statusVisual.label ? (
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]",
                        statusVisual.chipClass,
                        statusVisual.muted &&
                          "text-[color:var(--theme-text-secondary)]",
                      )}
                    >
                      {statusVisual.label}
                    </span>
                  ) : null}
                  {liveMarkerLabel ? (
                    <span
                      className="inline-flex items-center rounded-full border border-cyan-200/70 bg-cyan-400/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-cyan-50 shadow-[0_0_18px_rgba(103,232,249,0.28)]"
                      title="Active labor session"
                    >
                      {liveMarkerLabel}
                    </span>
                  ) : null}
                </div>

                <p className="text-xs uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
                  Created {createdLabel}
                </p>
              </div>

              <div
                className={cn(
                  "flex max-w-full flex-wrap items-center justify-end",
                  compact ? "gap-1" : "gap-1.5",
                  statusVisual.muted && "opacity-80",
                )}
              >
                {canAssign && onAssign ? (
                  <label
                    className="relative inline-flex items-center"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <UserRound className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-[color:var(--theme-text-muted)]" />
                    <span className="sr-only">Assigned technician</span>
                    <select
                      aria-label="Assigned technician"
                      value={line.assigned_tech_id ?? ""}
                      onChange={(event) => onAssign(event.target.value)}
                      className="h-8 max-w-44 appearance-none truncate rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] py-1 pl-7 pr-3 text-[10px] font-semibold text-[color:var(--theme-text-primary)]"
                    >
                      <option value="" disabled>
                        Unassigned
                      </option>
                      {technicians.map((tech) => (
                        <option key={tech.id} value={tech.id}>
                          {tech.full_name || "Unnamed tech"}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <span className="inline-flex max-w-44 items-center gap-1 truncate rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2.5 py-1 text-[10px] font-semibold text-[color:var(--theme-text-primary)]">
                    <UserRound className="h-3.5 w-3.5 shrink-0" />
                    {assignedTech}
                  </span>
                )}

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
                    onClick={handleAddPartClick}
                  >
                    Add Part
                  </Button>
                ) : null}

                {onRequestParts ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleRequestPartsClick}
                    disabled={requestPartsBusy}
                    className="border-sky-400/45 bg-sky-500/10 text-sky-100 hover:bg-sky-500/20"
                  >
                    <PackagePlus className="mr-1 h-4 w-4" />
                    {requestPartsBusy ? "Requesting…" : requestPartsLabel}
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
                  className={cn(
                    "border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)]",
                    compact && "px-2",
                  )}
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

            <div
              className={cn(
                "flex flex-wrap",
                compact ? "gap-1" : "gap-1.5",
                statusVisual.muted && "opacity-85",
              )}
            >
              {!hideExecutionStageCompletenessPills &&
              reviewFlags.missingCause ? (
                <ReviewPill
                  tone="warn"
                  label="Cause Missing"
                  title="Cause completeness"
                />
              ) : null}
              {!hideExecutionStageCompletenessPills &&
              reviewFlags.missingCorrection ? (
                <ReviewPill
                  tone="warn"
                  label="Correction Missing"
                  title="Correction completeness"
                />
              ) : null}
              {!hideExecutionStageCompletenessPills && reviewFlags.noParts ? (
                <ReviewPill
                  tone="warn"
                  label="No Parts"
                  title="Parts completeness"
                />
              ) : null}
              {isBlocked ? (
                <ReviewPill
                  tone="warn"
                  label="Blocked"
                  title="Line currently blocked or on hold"
                />
              ) : null}
              {waitingApproval ? (
                <ReviewPill
                  tone="info"
                  label="Awaiting Approval"
                  title="Waiting for approval decision"
                />
              ) : null}
              {reviewFlags.missingComplaint ? (
                <ReviewPill
                  tone="info"
                  label="Complaint Missing"
                  title="Complaint / description completeness"
                />
              ) : null}
              {reviewFlags.otherIssues > 0 ? (
                <ReviewPill
                  tone="info"
                  label={`${reviewFlags.otherIssues} Other`}
                  title="Additional review issues"
                />
              ) : null}
              {reviewOk ? (
                <ReviewPill
                  tone="ok"
                  label="Review Ready"
                  title="Review checks are clear"
                />
              ) : null}
            </div>

            {!collapsed ? (
              <>
                <div className="grid gap-2.5 sm:grid-cols-3">
                  <MetaTile
                    label="Labor"
                    value={formatLaborSummary(
                      Number.isFinite(Number(pricing?.laborHours))
                        ? Number(pricing?.laborHours)
                        : line.labor_time,
                      Number(pricing?.laborTotal ?? 0),
                    )}
                  />
                  <MetaTile
                    label="Parts"
                    value={[
                      formatPartsSummary({
                        partsCount: effectivePartsCount,
                        partsTotal: Number(pricing?.partsTotal ?? 0),
                      }),
                      partsStatusLabel,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  />
                  <MetaTile
                    label="Line Total"
                    value={
                      lineTotal > 0
                        ? formatCurrency(lineTotal)
                        : "Estimate pending"
                    }
                  />
                </div>

                {evidence.length > 0 ? (
                  <JobEvidenceStrip evidence={evidence} />
                ) : null}

                {line.complaint ||
                line.cause ||
                line.correction ||
                line.hold_reason ? (
                  <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3 text-xs text-[color:var(--theme-text-secondary)]">
                    {line.complaint ? (
                      <div>Complaint: {line.complaint}</div>
                    ) : null}
                    {line.cause ? <div>Cause: {line.cause}</div> : null}
                    {line.correction ? (
                      <div>Correction: {line.correction}</div>
                    ) : null}
                    {line.hold_reason ? (
                      <div>Blocker: {line.hold_reason}</div>
                    ) : null}
                    <div className="mt-2 text-[11px] text-[color:var(--theme-text-muted)]">
                      Updated {updatedLabel}
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
