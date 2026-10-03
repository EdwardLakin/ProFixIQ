import type { WorkOrderBoardStage } from "./types";
import { normalizeWorkOrderOperationalStage } from "@/features/work-orders/lib/operational-stage";

export type WorkOrderBoardStageSurface = {
  column: string;
  card: string;
  count: string;
};

const neutralColumn =
  "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)]";
const neutralCard =
  "bg-[color:var(--theme-surface-panel-strong)]";

export const WORK_ORDER_BOARD_STAGE_SURFACES: Record<
  WorkOrderBoardStage,
  WorkOrderBoardStageSurface
> = {
  intake: {
    column: `${neutralColumn} border-t-blue-500/55`,
    card: `${neutralCard} border-blue-500/25 border-l-blue-500/70`,
    count: "bg-blue-500/15 text-blue-700 dark:text-blue-200",
  },
  estimate: {
    column: `${neutralColumn} border-t-cyan-500/55`,
    card: `${neutralCard} border-cyan-500/25 border-l-cyan-500/70`,
    count: "bg-cyan-500/15 text-cyan-800 dark:text-cyan-200",
  },
  awaiting_approval: {
    column: `${neutralColumn} border-t-amber-400/55`,
    card: `${neutralCard} border-amber-400/25 border-l-amber-400/70`,
    count: "bg-amber-400/12 text-amber-800 dark:text-amber-200",
  },
  authorized: {
    column: `${neutralColumn} border-t-emerald-500/55`,
    card: `${neutralCard} border-emerald-500/25 border-l-emerald-500/70`,
    count: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200",
  },
  waiting: {
    column: `${neutralColumn} border-t-sky-400/55`,
    card: `${neutralCard} border-sky-400/25 border-l-sky-400/70`,
    count: "bg-sky-400/12 text-sky-800 dark:text-sky-200",
  },
  in_progress: {
    column: `${neutralColumn} border-t-violet-500/55`,
    card: `${neutralCard} border-violet-500/25 border-l-violet-500/70`,
    count: "bg-violet-500/15 text-violet-700 dark:text-violet-200",
  },
  quality_check: {
    column: `${neutralColumn} border-t-teal-500/55`,
    card: `${neutralCard} border-teal-500/25 border-l-teal-500/70`,
    count: "bg-teal-500/15 text-teal-800 dark:text-teal-200",
  },
  ready: {
    column: `${neutralColumn} border-t-emerald-400/55`,
    card: `${neutralCard} border-emerald-400/25 border-l-emerald-400/70`,
    count: "bg-emerald-400/12 text-emerald-800 dark:text-emerald-200",
  },
  awaiting_pickup: {
    column: `${neutralColumn} border-t-indigo-400/55`,
    card: `${neutralCard} border-indigo-400/25 border-l-indigo-400/70`,
    count: "bg-indigo-400/12 text-indigo-800 dark:text-indigo-200",
  },
  closed: {
    column: `${neutralColumn} border-t-slate-500/45`,
    card: `${neutralCard} border-slate-500/25 border-l-slate-500/55`,
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
