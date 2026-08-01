import type {
  WorkOrderBoardRisk,
  WorkOrderBoardRow,
  WorkOrderBoardStage,
  WorkOrderBoardVariant,
} from "./types";
import {
  WORK_ORDER_OPERATIONAL_STAGE_LABELS,
  normalizeWorkOrderOperationalStage,
} from "@/features/work-orders/lib/operational-stage";

type WaitingBoardRow = {
  overall_stage?: unknown;
  has_waiting_parts?: boolean | null;
};

export const ACTIONABLE_WORK_ORDER_NOTIFICATION_FILTER =
  "overall_stage.eq.awaiting_approval,and(overall_stage.eq.waiting,has_waiting_parts.eq.true)";

export function isWaitingPartsOperationalBlocker(
  row: WaitingBoardRow,
): boolean {
  return (
    normalizeWorkOrderOperationalStage(row.overall_stage) === "waiting" &&
    row.has_waiting_parts === true
  );
}

export function isGenericWaitingWorkOrder(row: WaitingBoardRow): boolean {
  return (
    normalizeWorkOrderOperationalStage(row.overall_stage) === "waiting" &&
    row.has_waiting_parts !== true
  );
}

export function formatStageLabel(
  row: WorkOrderBoardRow,
  variant: WorkOrderBoardVariant,
): string {
  if (variant === "portal" && row.portal_stage_label) return row.portal_stage_label;
  if (variant === "fleet" && row.fleet_stage_label) return row.fleet_stage_label;

  return WORK_ORDER_OPERATIONAL_STAGE_LABELS[
    normalizeWorkOrderOperationalStage(row.overall_stage)
  ];
}

export function stageAccent(
  stage: WorkOrderBoardStage | undefined,
  risk: WorkOrderBoardRisk | undefined,
): {
  border: string;
  badge: string;
  progress: string;
} {
  if (risk === "danger") {
    return {
      border: "border-red-500/70",
      badge: "bg-red-500/15 text-red-300 border-red-500/30",
      progress: "bg-red-400",
    };
  }

  if (risk === "warn") {
    return {
      border: "border-amber-500/60",
      badge: "bg-amber-500/15 text-amber-200 border-amber-500/30",
      progress: "bg-amber-400",
    };
  }

  switch (normalizeWorkOrderOperationalStage(stage)) {
    case "in_progress":
      return {
        border: "border-emerald-500/55",
        badge: "bg-emerald-500/15 text-emerald-200 border-emerald-500/30",
        progress: "bg-emerald-400",
      };
    case "waiting":
      return {
        border: "border-orange-500/55",
        badge: "bg-orange-500/15 text-orange-200 border-orange-500/30",
        progress: "bg-orange-400",
      };
    case "awaiting_approval":
      return {
        border: "border-[color:var(--pfq-copper)]/60",
        badge:
          "bg-[color:var(--pfq-copper)]/15 text-[color:var(--accent-copper-light)] border-[color:var(--pfq-copper)]/30",
        progress: "bg-[color:var(--pfq-copper)]",
      };
    case "ready":
      return {
        border: "border-lime-500/55",
        badge: "bg-lime-500/15 text-lime-200 border-lime-500/30",
        progress: "bg-lime-400",
      };
    case "closed":
      return {
        border: "border-[color:var(--theme-border-soft)]",
        badge: "bg-[color:var(--theme-surface-subtle)] text-[color:var(--theme-text-primary)] border-[color:var(--theme-border-soft)]",
        progress: "bg-[color:var(--theme-surface-subtle)]",
      };
    case "quality_check":
      return {
        border: "border-teal-500/55",
        badge: "bg-teal-500/15 text-teal-200 border-teal-500/30",
        progress: "bg-teal-400",
      };
    case "authorized":
      return {
        border: "border-emerald-500/55",
        badge: "bg-emerald-500/15 text-emerald-200 border-emerald-500/30",
        progress: "bg-emerald-400",
      };
    case "estimate":
      return {
        border: "border-cyan-500/45",
        badge: "bg-cyan-500/15 text-cyan-200 border-cyan-500/30",
        progress: "bg-cyan-400",
      };
    case "intake":
    default:
      return {
        border: "border-sky-500/45",
        badge: "bg-sky-500/15 text-sky-200 border-sky-500/30",
        progress: "bg-sky-400",
      };
  }
}

export function timeAgoLabel(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "Just now";

  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function buildBlockers(row: WorkOrderBoardRow, variant: WorkOrderBoardVariant): string[] {
  const chips: string[] = [];

  if (variant !== "portal" && row.assigned_summary === "Unassigned") {
    chips.push("Unassigned");
  }

  if (isWaitingPartsOperationalBlocker(row)) {
    chips.push(variant === "portal" ? "Parts on order" : "Waiting parts");
  }

  const stage = normalizeWorkOrderOperationalStage(row.overall_stage);

  if (stage === "awaiting_approval") {
    chips.push(variant === "portal" ? "Approval needed" : "Awaiting approval");
  }

  if (isGenericWaitingWorkOrder(row)) {
    chips.push(variant === "portal" ? "Preparing next step" : "Waiting");
  }

  if (row.risk_reason) {
    chips.push(row.risk_reason);
  }

  return chips.slice(0, 2);
}
