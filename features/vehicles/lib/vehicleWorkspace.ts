import type { CanonicalRole } from "@/features/shared/lib/rbac";
import type { WorkspaceSourceReference } from "@/features/workspace/lib/workspace";

export const VEHICLE_WORKSPACE_READER_ROLES = [
  "owner",
  "admin",
  "manager",
  "advisor",
  "service",
  "parts",
  "mechanic",
  "lead_hand",
  "foreman",
] as const satisfies readonly CanonicalRole[];

export type VehicleWorkspaceSourceType =
  | "appointment"
  | "history"
  | "inspection"
  | "invoice"
  | "maintenance_suggestion"
  | "part_request"
  | "payment"
  | "vehicle_media"
  | "work_order"
  | "work_order_line"
  | "work_order_media"
  | "work_order_part"
  | "work_order_quote_line";

export type VehicleWorkspaceReference =
  WorkspaceSourceReference<VehicleWorkspaceSourceType>;

export type VehicleWorkspacePermissions = {
  canViewAccountContact: boolean;
  canOpenAccount: boolean;
  canViewFinancials: boolean;
  canViewEstimates: boolean;
  canOpenInspections: boolean;
  canOpenWorkOrders: boolean;
  canViewPartRequests: boolean;
  canCreateWorkOrder: boolean;
  canBookAppointment: boolean;
  canOpenAppointments: boolean;
  canCreateEstimate: boolean;
  canMessageCustomer: boolean;
  canViewRelatedVehicles: boolean;
  isAssignedWorkOnly: boolean;
};

export type VehicleIdentity = {
  id: string;
  year: number | null;
  make: string | null;
  model: string | null;
  submodel: string | null;
  vin: string | null;
  licensePlate: string | null;
  unitNumber: string | null;
  mileage: string | null;
  odometerUnit: string | null;
  engineHours: number | null;
  status: string | null;
};

export type CustomerAccountSummary = {
  id: string;
  displayName: string;
  accountType: string;
  active: boolean;
  email?: string | null;
  phone?: string | null;
  archivedAt: string | null;
  mergedIntoCustomerId: string | null;
};

export type ActiveWorkSummary = {
  kind:
    | "estimate"
    | "inspection"
    | "invoice"
    | "part_request"
    | "work_order";
  title: string;
  status: string;
  detail: string | null;
  occurredAt: string | null;
  amount?: number;
  currency?: string;
  reference: VehicleWorkspaceReference;
};

export type AppointmentSummary = {
  title: string;
  status: string;
  startsAt: string;
  endsAt: string;
  detail: string | null;
  reference: VehicleWorkspaceReference;
};

export type VehicleAttentionItem = {
  kind:
    | "deferred_work"
    | "failed_inspection"
    | "maintenance_due"
    | "unresolved_concern"
    | "waiting_parts";
  title: string;
  explanation: string;
  severity: "info" | "warning" | "urgent";
  occurredAt: string | null;
  reference: VehicleWorkspaceReference;
};

export type VehicleTimelineEvent = {
  kind:
    | "approval"
    | "appointment"
    | "estimate"
    | "history"
    | "inspection"
    | "invoice"
    | "part"
    | "payment"
    | "repair"
    | "work_order";
  title: string;
  detail: string | null;
  occurredAt: string;
  reference: VehicleWorkspaceReference;
};

export type VehicleFinancialSummary =
  | { visible: false }
  | {
      visible: true;
      currency: string | null;
      invoiceCount: number;
      outstandingAmount: number | null;
      paidAmount: number | null;
    };

export type VehicleDocumentSummary = {
  vehicleMediaCount: number;
  workOrderMediaCount: number;
  inspectionReportCount: number;
  latestReference: VehicleWorkspaceReference | null;
};

export type RelatedVehicleSummary = {
  id: string;
  label: string;
  status: string | null;
  href: string;
};

export type VehicleWorkspaceConflict = {
  kind:
    | "archived_account"
    | "historical_owner"
    | "missing_current_account"
    | "multiple_active_work_orders"
    | "vehicle_status";
  title: string;
  detail: string;
  sourceIds: string[];
};

export type VehicleWorkspaceSnapshot = {
  identity: VehicleIdentity;
  currentAccount: CustomerAccountSummary | null;
  permissions: VehicleWorkspacePermissions;
  activeWork: ActiveWorkSummary[];
  upcomingAppointments: AppointmentSummary[];
  attentionItems: VehicleAttentionItem[];
  recentTimeline: VehicleTimelineEvent[];
  financialSummary: VehicleFinancialSummary;
  documentSummary: VehicleDocumentSummary;
  relatedVehicles: RelatedVehicleSummary[];
  conflicts: VehicleWorkspaceConflict[];
};

export type VehicleWorkspaceActionHrefs = {
  bookAppointment: string | null;
  createEstimate: string | null;
  messageCustomer: string | null;
};

export function vehicleWorkspaceActionHrefs(
  snapshot: VehicleWorkspaceSnapshot,
): VehicleWorkspaceActionHrefs {
  const account = snapshot.currentAccount;
  const blocked = snapshot.conflicts.some((conflict) =>
    ["archived_account", "vehicle_status"].includes(conflict.kind),
  );
  if (
    blocked ||
    !account?.active ||
    account.archivedAt ||
    account.mergedIntoCustomerId
  ) {
    return {
      bookAppointment: null,
      createEstimate: null,
      messageCustomer: null,
    };
  }

  const handoff = new URLSearchParams({
    customerId: account.id,
    vehicleId: snapshot.identity.id,
  });
  return {
    bookAppointment: snapshot.permissions.canBookAppointment
      ? `/dashboard/appointments?openCreate=1&${handoff.toString()}`
      : null,
    createEstimate: snapshot.permissions.canCreateEstimate
      ? `/estimates/new?${handoff.toString()}`
      : null,
    messageCustomer: snapshot.permissions.canMessageCustomer
      ? `/chat?compose=customer&contextType=vehicle&contextId=${encodeURIComponent(snapshot.identity.id)}&customerId=${encodeURIComponent(account.id)}`
      : null,
  };
}

export type VehicleWorkspaceSearchCard = {
  vehicle: VehicleIdentity;
  currentAccount: Pick<CustomerAccountSummary, "id" | "displayName"> | null;
  latestOdometer: string | null;
  activeWork: Pick<
    ActiveWorkSummary,
    "kind" | "title" | "status" | "reference"
  >[];
  nextAppointment: AppointmentSummary | null;
  attentionCount: number;
  outstandingAmount?: number;
  currency?: string | null;
  workspaceHref: string;
  createWorkOrderHref: string | null;
};

export type VehicleWorkspaceSearchGroup = {
  account: Pick<
    CustomerAccountSummary,
    "id" | "displayName" | "accountType" | "active"
  > | null;
  matchedAccount: boolean;
  vehicles: VehicleWorkspaceSearchCard[];
};

export type VehicleWorkspaceSearchResponse = {
  query: string;
  groups: VehicleWorkspaceSearchGroup[];
  accountsWithoutVehicles: Array<
    Pick<CustomerAccountSummary, "id" | "displayName" | "accountType" | "active">
  >;
  permissions: VehicleWorkspacePermissions;
};

export function customerAccountDisplayName(input: {
  business_name?: string | null;
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  phone_number?: string | null;
}): string {
  const person = [input.first_name, input.last_name]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" ")
    .trim();

  return (
    input.business_name?.trim() ||
    input.name?.trim() ||
    person ||
    input.email?.trim() ||
    input.phone?.trim() ||
    input.phone_number?.trim() ||
    "Unnamed account"
  );
}

export function vehicleIdentityLabel(
  vehicle: Pick<VehicleIdentity, "year" | "make" | "model" | "unitNumber">,
): string {
  const description = [vehicle.year, vehicle.make, vehicle.model]
    .filter(Boolean)
    .join(" ");
  const unit = vehicle.unitNumber?.trim();
  return [description || "Vehicle", unit ? `Unit ${unit}` : null]
    .filter(Boolean)
    .join(" · ");
}

export function createWorkOrderHandoffHref(input: {
  customerId: string | null;
  vehicleId: string;
}): string | null {
  if (!input.customerId) return null;
  const query = new URLSearchParams({
    autostart: "1",
    customerId: input.customerId,
    vehicleId: input.vehicleId,
  });
  return `/work-orders/create?${query.toString()}`;
}
