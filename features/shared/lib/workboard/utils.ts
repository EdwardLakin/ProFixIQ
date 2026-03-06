import type {
  WorkOrderBoardRisk,
  WorkOrderBoardRow,
  WorkOrderBoardStage,
  WorkOrderBoardVariant,
} from "./types";

export function formatStageLabel(
  row: WorkOrderBoardRow,
  variant: WorkOrderBoardVariant,
): string {
  if (variant === "portal" && row.portal_stage_label) return row.portal_stage_label;
  if (variant === "fleet" && row.fleet_stage_label) return row.fleet_stage_label;

  switch (row.overall_stage) {
    case "completed":
      return "Completed";
    case "on_hold":
      return "On hold";
    case "waiting_parts":
      return "Waiting for parts";
    case "awaiting_approval":
      return "Awaiting approval";
    case "in_progress":
      return "In progress";
    case "awaiting":
      return "Awaiting";
    default:
      return "Awaiting";
  }
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

  switch (stage) {
    case "in_progress":
      return {
        border: "border-emerald-500/55",
        badge: "bg-emerald-500/15 text-emerald-200 border-emerald-500/30",
        progress: "bg-emerald-400",
      };
    case "on_hold":
      return {
        border: "border-yellow-500/55",
        badge: "bg-yellow-500/15 text-yellow-200 border-yellow-500/30",
        progress: "bg-yellow-400",
      };
    case "waiting_parts":
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
    case "completed":
      return {
        border: "border-slate-500/45",
        badge: "bg-slate-500/15 text-slate-200 border-slate-500/30",
        progress: "bg-slate-300",
      };
    case "awaiting":
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

  if (row.has_waiting_parts) {
    chips.push(variant === "portal" ? "Parts on order" : "Waiting parts");
  }

  if (row.overall_stage === "awaiting_approval") {
    chips.push(variant === "portal" ? "Approval needed" : "Awaiting approval");
  }

  if (row.risk_reason) {
    chips.push(row.risk_reason);
  }

  return chips.slice(0, 2);
}
