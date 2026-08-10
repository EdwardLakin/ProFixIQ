export type FleetServiceRequestItem = {
  id: string;
  fleetId: string;
  fleetName: string;
  vehicleId: string;
  unitLabel: string;
  vehicleDescription: string;
  title: string;
  summary: string;
  severity: string;
  status: string;
  createdAt: string;
  requestedForDate: string | null;
  scheduledForDate: string | null;
  sourcePmDueEventId: string | null;
  workOrder: {
    id: string;
    reference: string;
    status: string;
    approvalState: string | null;
    needsApproval: boolean;
    scheduledAt: string | null;
    expectedCompletionAt: string | null;
    paymentStatus: string;
    outstandingBalance: number;
  } | null;
  shopProgress: {
    status: string;
    scheduledAt: string | null;
    expectedCompletionAt: string | null;
  } | null;
};

export type FleetServiceRequestsPayload = {
  canManage: boolean;
  summary: {
    open: number;
    scheduled: number;
    awaitingApproval: number;
    completed: number;
  };
  requests: FleetServiceRequestItem[];
};
