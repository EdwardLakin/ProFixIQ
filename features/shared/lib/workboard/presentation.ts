import type { WorkOrderBoardStage } from "./types";
import { normalizeWorkOrderOperationalStage } from "@/features/work-orders/lib/operational-stage";

export type WorkOrderBoardStageSurface = {
  column: string;
  card: string;
  count: string;
};

export const WORK_ORDER_BOARD_STAGE_SURFACES: Record<
  WorkOrderBoardStage,
  WorkOrderBoardStageSurface
> = {
  intake: {
    column: "border-blue-500/25 bg-blue-500/[0.055]",
    card: "border-blue-500/30 bg-blue-500/[0.075]",
    count: "bg-blue-500/15 text-blue-700 dark:text-blue-200",
  },
  estimate: {
    column: "border-cyan-500/25 bg-cyan-500/[0.055]",
    card: "border-cyan-500/30 bg-cyan-500/[0.075]",
    count: "bg-cyan-500/15 text-cyan-800 dark:text-cyan-200",
  },
  awaiting_approval: {
    column: "border-amber-500/25 bg-amber-500/[0.055]",
    card: "border-amber-500/30 bg-amber-500/[0.075]",
    count: "bg-amber-500/15 text-amber-800 dark:text-amber-200",
  },
  authorized: {
    column: "border-emerald-500/25 bg-emerald-500/[0.055]",
    card: "border-emerald-500/30 bg-emerald-500/[0.075]",
    count: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200",
  },
  waiting: {
    column: "border-orange-500/25 bg-orange-500/[0.055]",
    card: "border-orange-500/30 bg-orange-500/[0.075]",
    count: "bg-orange-500/15 text-orange-800 dark:text-orange-200",
  },
  in_progress: {
    column: "border-violet-500/25 bg-violet-500/[0.055]",
    card: "border-violet-500/30 bg-violet-500/[0.075]",
    count: "bg-violet-500/15 text-violet-700 dark:text-violet-200",
  },
  quality_check: {
    column: "border-teal-500/25 bg-teal-500/[0.055]",
    card: "border-teal-500/30 bg-teal-500/[0.075]",
    count: "bg-teal-500/15 text-teal-800 dark:text-teal-200",
  },
  ready: {
    column: "border-lime-500/25 bg-lime-500/[0.055]",
    card: "border-lime-500/30 bg-lime-500/[0.075]",
    count: "bg-lime-500/15 text-lime-800 dark:text-lime-200",
  },
  closed: {
    column: "border-slate-500/25 bg-slate-500/[0.055]",
    card: "border-slate-500/30 bg-slate-500/[0.075]",
    count: "bg-slate-500/15 text-slate-700 dark:text-slate-200",
  },
};

export function getWorkOrderBoardStageSurface(
  stage: WorkOrderBoardStage | null | undefined,
): WorkOrderBoardStageSurface {
  return WORK_ORDER_BOARD_STAGE_SURFACES[
    normalizeWorkOrderOperationalStage(stage)
  ];
}
