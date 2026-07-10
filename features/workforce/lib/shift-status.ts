export const SHIFT_STATUSES = {
  open: "active",
  closed: "completed",
} as const;

export type ShiftOpenStatus = typeof SHIFT_STATUSES.open;
export type ShiftClosedStatus = typeof SHIFT_STATUSES.closed;
export type ShiftStatus = ShiftOpenStatus | ShiftClosedStatus;

export function isOpenShiftStatus(status: string | null | undefined): boolean {
  return status === SHIFT_STATUSES.open;
}

export function isClosedShiftStatus(status: string | null | undefined): boolean {
  return status === SHIFT_STATUSES.closed;
}
