export const BOOKING_STATUSES = [
  "pending",
  "confirmed",
  "cancelled",
  "completed",
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

const ALLOWED_TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  pending: ["pending", "confirmed", "cancelled"],
  confirmed: ["confirmed", "cancelled", "completed"],
  cancelled: ["cancelled"],
  completed: ["completed"],
};

export function normalizeBookingStatus(value: unknown): BookingStatus | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  return BOOKING_STATUSES.includes(normalized as BookingStatus)
    ? (normalized as BookingStatus)
    : null;
}

export function canTransitionBookingStatus(
  current: unknown,
  next: unknown,
): boolean {
  const from = normalizeBookingStatus(current) ?? "pending";
  const to = normalizeBookingStatus(next);
  return Boolean(to && ALLOWED_TRANSITIONS[from].includes(to));
}
