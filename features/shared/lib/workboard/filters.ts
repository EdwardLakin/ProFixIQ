export const WORK_ORDER_BOARD_FILTER_KEYS = [
  "all",
  "awaiting",
  "in_progress",
  "awaiting_approval",
  "waiting_parts",
  "on_hold",
  "completed",
] as const;

export type WorkOrderBoardFilterKey = (typeof WORK_ORDER_BOARD_FILTER_KEYS)[number];

export function parseWorkOrderBoardStageFilter(
  stage: string | null | undefined,
): WorkOrderBoardFilterKey {
  return WORK_ORDER_BOARD_FILTER_KEYS.includes(stage as WorkOrderBoardFilterKey)
    ? (stage as WorkOrderBoardFilterKey)
    : "all";
}
