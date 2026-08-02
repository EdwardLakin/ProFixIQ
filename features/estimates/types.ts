import type { CanonicalRole } from "@/features/shared/lib/rbac";

export const ESTIMATE_STATUSES = [
  "draft",
  "waiting_for_parts",
  "ready_for_advisor",
  "sent",
  "partially_approved",
  "approved",
  "declined",
  "deferred",
  "expired",
] as const;

export type EstimateStatus = (typeof ESTIMATE_STATUSES)[number];
export type EstimateWorkspaceMode = "advisor" | "parts";

export type EstimateCustomerForm = {
  id?: string | null;
  business_name?: string | null;
  name?: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
};

export type EstimateVehicleForm = {
  id?: string | null;
  year: string | null;
  make: string | null;
  model: string | null;
  vin: string | null;
  license_plate: string | null;
  mileage: string | null;
  color: string | null;
  unit_number?: string | null;
  engine_hours?: string | null;
  engine?: string | null;
  submodel?: string | null;
  engine_family?: string | null;
  engine_type?: string | null;
  transmission?: string | null;
  transmission_type?: string | null;
  fuel_type?: string | null;
  drivetrain?: string | null;
};

export type EstimatePartDraft = {
  clientKey: string;
  description: string;
  quantity: number;
  partNumber: string;
  manufacturer: string;
};

export type EstimateLineDraft = {
  id?: string | null;
  clientKey: string;
  title: string;
  customerDescription: string;
  advisorNotes: string;
  laborHours: number;
  laborRate: number;
  parts: EstimatePartDraft[];
  status?: string | null;
  stage?: string | null;
  partsTotal?: number;
  grandTotal?: number;
  sentAt?: string | null;
  approvedAt?: string | null;
  workOrderLineId?: string | null;
};

export type EstimateListItem = {
  id: string;
  estimateNumber: string;
  estimateStatus: EstimateStatus;
  estimateRevision: number;
  recordType: string;
  customId: string | null;
  customerName: string;
  vehicleLabel: string;
  vehicleVin: string | null;
  vehicleUnitNumber: string | null;
  advisorId: string | null;
  laborTotal: number;
  partsTotal: number;
  createdAt: string | null;
  updatedAt: string | null;
  expiresAt: string | null;
};

export type EstimateRequestItem = {
  id: string;
  requestId: string;
  quoteLineId: string | null;
  sourceRowId: string | null;
  description: string;
  quantity: number;
  requestedPartNumber: string | null;
  requestedManufacturer: string | null;
  quotedPrice: number | null;
  unitCost: number | null;
  vendor: string | null;
  status: string;
  priced: boolean;
};

export type EstimatePartRequest = {
  id: string;
  quoteLineId: string | null;
  status: string;
  sourceRevision: number | null;
  notes: string | null;
  createdAt: string;
  items: EstimateRequestItem[];
};

export type EstimateEvent = {
  id: string;
  revision: number;
  eventType: string;
  reasonCode: string | null;
  note: string | null;
  changedQuoteLineIds: string[];
  createdAt: string;
};

export type EstimateActor = {
  role: CanonicalRole;
  mode: EstimateWorkspaceMode;
  canCreate: boolean;
  canEdit: boolean;
  canSend: boolean;
  canCompleteParts: boolean;
};

export type EstimateDetail = {
  actor: EstimateActor;
  shop: {
    id: string;
    laborRate: number;
  };
  estimate: {
    id: string;
    estimateNumber: string;
    estimateStatus: EstimateStatus;
    estimateRevision: number;
    recordType: string;
    customId: string | null;
    notes: string | null;
    expiresAt: string | null;
    createdAt: string | null;
    updatedAt: string | null;
    sentAt: string | null;
    customer: EstimateCustomerForm;
    vehicle: EstimateVehicleForm;
    lines: EstimateLineDraft[];
    requests: EstimatePartRequest[];
    events: EstimateEvent[];
  };
};

export type EstimateListPayload = {
  actor: EstimateActor;
  shop: { id: string; laborRate: number };
  estimates: EstimateListItem[];
};

export const EMPTY_ESTIMATE_CUSTOMER: EstimateCustomerForm = {
  business_name: null,
  name: null,
  first_name: null,
  last_name: null,
  phone: null,
  email: null,
  address: null,
  city: null,
  province: null,
  postal_code: null,
};

export const EMPTY_ESTIMATE_VEHICLE: EstimateVehicleForm = {
  year: null,
  make: null,
  model: null,
  vin: null,
  license_plate: null,
  mileage: null,
  color: null,
  unit_number: null,
  engine_hours: null,
  engine: null,
  submodel: null,
  engine_family: null,
  engine_type: null,
  transmission: null,
  transmission_type: null,
  fuel_type: null,
  drivetrain: null,
};
