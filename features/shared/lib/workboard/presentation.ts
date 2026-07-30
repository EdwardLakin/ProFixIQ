import type { WorkOrderBoardStage } from "./types";

export type WorkOrderBoardStageSurface = {
  column: string;
  card: string;
  count: string;
};

export const WORK_ORDER_BOARD_STAGE_SURFACES: Record<
  WorkOrderBoardStage,
  WorkOrderBoardStageSurface
> = {
  awaiting: {
    column: "border-blue-500/25 bg-blue-500/[0.055]",
    card: "border-blue-500/30 bg-blue-500/[0.075]",
    count: "bg-blue-500/15 text-blue-700 dark:text-blue-200",
  },
  in_progress: {
    column: "border-violet-500/25 bg-violet-500/[0.055]",
    card: "border-violet-500/30 bg-violet-500/[0.075]",
    count: "bg-violet-500/15 text-violet-700 dark:text-violet-200",
  },
  awaiting_approval: {
    column: "border-amber-500/25 bg-amber-500/[0.055]",
    card: "border-amber-500/30 bg-amber-500/[0.075]",
    count: "bg-amber-500/15 text-amber-800 dark:text-amber-200",
  },
  waiting_parts: {
    column: "border-orange-500/25 bg-orange-500/[0.055]",
    card: "border-orange-500/30 bg-orange-500/[0.075]",
    count: "bg-orange-500/15 text-orange-800 dark:text-orange-200",
  },
  on_hold: {
    column: "border-rose-500/25 bg-rose-500/[0.055]",
    card: "border-rose-500/30 bg-rose-500/[0.075]",
    count: "bg-rose-500/15 text-rose-700 dark:text-rose-200",
  },
  completed: {
    column: "border-emerald-500/25 bg-emerald-500/[0.055]",
    card: "border-emerald-500/30 bg-emerald-500/[0.075]",
    count: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-200",
  },
  empty: {
    column:
      "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)]",
    card: "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)]",
    count:
      "bg-[color:var(--theme-surface-inset)] text-[color:var(--theme-text-secondary)]",
  },
};

export function getWorkOrderBoardStageSurface(
  stage: WorkOrderBoardStage | null | undefined,
): WorkOrderBoardStageSurface {
  return WORK_ORDER_BOARD_STAGE_SURFACES[stage ?? "empty"];
}
