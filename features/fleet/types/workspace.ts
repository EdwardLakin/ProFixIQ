export type FleetUnitOperationalStatus = "in_service" | "limited" | "oos";

export type FleetPriority = "critical" | "attention" | "good" | "info";

export type FleetSummaryBullet = {
  id: string;
  priority: FleetPriority;
  label: string;
  detail: string;
  target: "overview" | "maintenance" | "history" | "activity";
};

export type FleetUnitReading = {
  id: string;
  odometerKm: number | null;
  engineHours: number | null;
  sourceType: string;
  recordedAt: string;
};

export type FleetPmItem = {
  id: string;
  policyId: string;
  programId: string;
  name: string;
  status: string;
  dueReasons: string[];
  firstDueAt: string;
  deferredUntil: string | null;
  serviceRequestId: string | null;
  intervalKm: number | null;
  intervalHours: number | null;
  intervalDays: number | null;
  anchorOdometerKm: number | null;
  anchorEngineHours: number | null;
  anchorDate: string | null;
};

export type FleetUnitRequest = {
  id: string;
  title: string;
  summary: string;
  severity: string;
  status: string;
  createdAt: string;
  scheduledForDate: string | null;
  workOrderId: string | null;
};

export type FleetQuoteLine = {
  id: string;
  description: string;
  status: string;
  stage: string;
  total: number;
  sentAt: string | null;
  approvedAt: string | null;
  declinedAt: string | null;
};

export type FleetInvoiceSummary = {
  id: string;
  workOrderId: string;
  versionNumber: number;
  lifecycleStatus: string;
  currency: "CAD" | "USD";
  total: number;
  outstandingTotal: number;
  paidTotal: number;
  issuedAt: string | null;
};

export type FleetWorkOrderHistory = {
  id: string;
  reference: string;
  status: string;
  approvalState: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  scheduledAt: string | null;
  completedAt: string | null;
  invoiceTotal: number;
  paymentStatus: string;
  outstandingBalance: number;
  quoteLines: FleetQuoteLine[];
  invoice: FleetInvoiceSummary | null;
};

export type FleetPretripSummary = {
  id: string;
  driverName: string;
  inspectionDate: string;
  odometerKm: number | null;
  hasDefects: boolean;
  status: string;
  notes: string | null;
};

export type FleetUnitWorkspacePayload = {
  unit: {
    id: string;
    fleetId: string;
    fleetName: string;
    label: string;
    status: FleetUnitOperationalStatus;
    year: number | null;
    make: string | null;
    model: string | null;
    vin: string | null;
    plate: string | null;
    assetType: string | null;
    bodyType: string | null;
    engine: string | null;
    transmission: string | null;
    fuelType: string | null;
    tags: string | null;
    notes: string | null;
    currentOdometerKm: number | null;
    currentEngineHours: number | null;
    lastReadingAt: string | null;
    nextInspectionDate: string | null;
  };
  metrics: {
    openRequests: number;
    openApprovals: number;
    activePmDue: number;
    lifetimeWorkOrders: number;
    lifetimeSpend: number;
    outstandingBalance: number;
  };
  summary: FleetSummaryBullet[];
  maintenance: FleetPmItem[];
  requests: FleetUnitRequest[];
  workOrders: FleetWorkOrderHistory[];
  readings: FleetUnitReading[];
  pretrips: FleetPretripSummary[];
};
