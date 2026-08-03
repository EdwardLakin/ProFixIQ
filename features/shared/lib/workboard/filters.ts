import {
  CANONICAL_WORK_ORDER_OPERATIONAL_STAGES,
  parseWorkOrderOperationalStage,
} from "@/features/work-orders/lib/operational-stage";

export const WORK_ORDER_BOARD_FILTER_KEYS = [
  "all",
  ...CANONICAL_WORK_ORDER_OPERATIONAL_STAGES,
] as const;

export type WorkOrderBoardFilterKey = (typeof WORK_ORDER_BOARD_FILTER_KEYS)[number];

const LEGACY_BOARD_FILTERS: Record<string, WorkOrderBoardFilterKey> = {
  waiting_parts: "waiting",
  on_hold: "waiting",
  ready_to_invoice: "ready",
  completed: "ready",
};

export function parseWorkOrderBoardStageFilter(
  stage: string | null | undefined,
): WorkOrderBoardFilterKey {
  if (!stage) return "all";
  if (stage === "all") return "all";

  const legacyFilter = LEGACY_BOARD_FILTERS[stage.trim().toLowerCase()];
  if (legacyFilter) return legacyFilter;

  return parseWorkOrderOperationalStage(stage) ?? "all";
}
