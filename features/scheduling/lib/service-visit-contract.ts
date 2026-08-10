export const SERVICE_VISIT_MODES = ["shop", "mobile"] as const;
export type ServiceVisitMode = (typeof SERVICE_VISIT_MODES)[number];

export const SERVICE_VISIT_STATUSES = [
  "scheduled",
  "dispatched",
  "en_route",
  "arrived",
  "working",
  "paused",
  "completed",
  "cancelled",
] as const;
export type ServiceVisitStatus = (typeof SERVICE_VISIT_STATUSES)[number];

export const ACTIVE_SERVICE_VISIT_STATUSES: readonly ServiceVisitStatus[] = [
  "scheduled",
  "dispatched",
  "en_route",
  "arrived",
  "working",
  "paused",
] as const;

export const SERVICE_VISIT_TRANSITIONS: Readonly<
  Record<ServiceVisitStatus, readonly ServiceVisitStatus[]>
> = {
  scheduled: ["dispatched", "cancelled"],
  dispatched: ["en_route", "cancelled"],
  en_route: ["arrived", "cancelled"],
  arrived: ["working", "cancelled"],
  working: ["paused", "completed"],
  paused: ["working", "completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export type ServiceAddressInput = {
  customerId?: string | null;
  label?: string | null;
  addressLine1: string;
  addressLine2?: string | null;
  city?: string | null;
  provinceState?: string | null;
  postalCode?: string | null;
  countryCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  accessNotes?: string | null;
};

export type CreateServiceVisitInput = {
  workOrderId: string;
  mode: ServiceVisitMode;
  serviceAddressId?: string | null;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  assignedUserId?: string | null;
  serviceVehicleId?: string | null;
  dispatchNotes?: string | null;
  estimatedTravelMinutes?: number | null;
  estimatedDistanceKm?: number | null;
};

export type ServiceVisitLifecyclePatch = {
  status: ServiceVisitStatus;
  travelStartedAt?: string | null;
  arrivedAt?: string | null;
  workStartedAt?: string | null;
  completedAt?: string | null;
  actualTravelMinutes?: number | null;
  actualDistanceKm?: number | null;
};

export function canTransitionServiceVisit(
  from: ServiceVisitStatus,
  to: ServiceVisitStatus,
): boolean {
  return SERVICE_VISIT_TRANSITIONS[from].includes(to);
}

export function isActiveServiceVisitStatus(
  value: ServiceVisitStatus,
): boolean {
  return ACTIVE_SERVICE_VISIT_STATUSES.includes(value);
}

export function assertServiceVisitSchedule(
  scheduledStart?: string | null,
  scheduledEnd?: string | null,
): void {
  if (!scheduledStart || !scheduledEnd) return;

  const start = Date.parse(scheduledStart);
  const end = Date.parse(scheduledEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    throw new Error("Service visit schedule must use valid date/time values.");
  }
  if (end <= start) {
    throw new Error("Service visit end must be after its start.");
  }
}
