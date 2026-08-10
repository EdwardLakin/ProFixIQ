import type {
  ServiceVisitMode,
  ServiceVisitStatus,
} from "@/features/scheduling/lib/service-visit-contract";

export type DispatchAssignmentState =
  | "unassigned"
  | "technician_only"
  | "vehicle_only"
  | "assigned";

export type DispatchCustomer = {
  id: string;
  name: string;
  phone?: string | null;
};

export type DispatchVehicle = {
  id: string;
  label?: string | null;
  plate?: string | null;
  vin?: string | null;
};

export type DispatchServiceAddress = {
  id: string;
  label?: string | null;
  addressLine1: string;
  addressLine2?: string | null;
  city?: string | null;
  provinceState?: string | null;
  postalCode?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  accessNotes?: string | null;
};

export type DispatchTechnician = {
  id: string;
  name: string;
  role?: string | null;
};

export type DispatchServiceVehicle = {
  id: string;
  name: string;
  unitNumber?: string | null;
  stockLocationId?: string | null;
};

export type DispatchSchedulingResource = {
  id: string;
  name: string;
  resourceType: string;
};

export type DispatchVisit = {
  id: string;
  shopId: string;
  bookingId?: string | null;
  workOrderId?: string | null;
  workOrderNumber?: string | null;
  mode: ServiceVisitMode;
  status: ServiceVisitStatus;
  version: number;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  dispatchNotes?: string | null;
  estimatedTravelMinutes?: number | null;
  actualTravelMinutes?: number | null;
  estimatedDistanceKm?: number | string | null;
  actualDistanceKm?: number | string | null;
  dispatchedAt?: string | null;
  travelStartedAt?: string | null;
  arrivedAt?: string | null;
  workStartedAt?: string | null;
  pausedAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  lastStatusAt?: string | null;
  createdAt: string;
  updatedAt: string;
  assignmentState: DispatchAssignmentState;
  customer?: DispatchCustomer | null;
  vehicle?: DispatchVehicle | null;
  serviceAddress?: DispatchServiceAddress | null;
  assignedTechnician?: DispatchTechnician | null;
  serviceVehicle?: DispatchServiceVehicle | null;
  resource?: DispatchSchedulingResource | null;
  allowedTransitions: ServiceVisitStatus[];
};

export type DispatchBoardSnapshot = {
  generatedAt: string;
  visits: DispatchVisit[];
  technicians: DispatchTechnician[];
  serviceVehicles: DispatchServiceVehicle[];
};

export type DispatchVisitHistoryEvent = {
  id: string;
  eventType: "created" | "updated" | "rescheduled" | "assigned" | "transitioned";
  fromStatus?: ServiceVisitStatus | null;
  toStatus?: ServiceVisitStatus | null;
  occurredAt: string;
  actor?: { id: string; name: string } | null;
  assignedUserId?: string | null;
  serviceVehicleId?: string | null;
  metadata: Record<string, unknown>;
};

export type MobileActiveJobContract = {
  serverNow: string;
  activeJob: DispatchVisit | null;
  nextJob: DispatchVisit | null;
};

export type DispatchMutationResult = {
  ok: true;
  visit: DispatchVisit;
  idempotent: boolean;
};
