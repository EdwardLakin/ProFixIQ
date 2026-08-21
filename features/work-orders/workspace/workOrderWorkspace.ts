import type { WorkspaceResourceContext } from "@/features/workspace/lib/workspace";

export type WorkOrderWorkspaceServerSnapshot = {
  routeId: string;
  resource: WorkspaceResourceContext;
  workOrder: {
    id: string;
    shopId: string;
    customerId: string | null;
    vehicleId: string | null;
    customId: string | null;
    status: string | null;
    paymentStatus: string | null;
    approvalState: string | null;
    recordType: string | null;
  };
};

export function resolveWorkOrderWorkspaceResource(input: {
  initialResource?: WorkspaceResourceContext | null;
  loadedResource?: WorkspaceResourceContext | null;
}): WorkspaceResourceContext | null {
  const serverWorkOrderId = input.initialResource?.workOrderId ?? null;
  if (
    serverWorkOrderId &&
    input.loadedResource?.workOrderId !== serverWorkOrderId
  ) {
    return input.initialResource ?? null;
  }
  return input.loadedResource ?? input.initialResource ?? null;
}

export const WORK_ORDER_WORKSPACE_MODULES = {
  statusCommand: {
    anchorId: "work-order-workspace-command",
    label: "Work order status and commands",
  },
  repairLines: {
    anchorId: "work-order-workspace-repair-lines",
    label: "Repair lines",
  },
  inspection: {
    anchorId: "work-order-workspace-inspection",
    label: "Inspection",
  },
  parts: {
    anchorId: "work-order-workspace-parts",
    label: "Parts",
  },
  estimateApproval: {
    anchorId: "work-order-workspace-estimate-approval",
    label: "Estimate and approval",
  },
  communication: {
    anchorId: "work-order-workspace-communication",
    label: "Communication",
  },
  documents: {
    anchorId: "work-order-workspace-documents",
    label: "Documents",
  },
  financials: {
    anchorId: "work-order-workspace-financials",
    label: "Financials",
  },
  timeline: {
    anchorId: "work-order-workspace-timeline",
    label: "Timeline",
  },
} as const;

export type WorkOrderWorkspaceModuleKey =
  keyof typeof WORK_ORDER_WORKSPACE_MODULES;

export type WorkOrderJobWorkspaceTabId =
  | "overview"
  | "story"
  | "inspection"
  | "parts"
  | "evidence"
  | "details";

export type WorkOrderJobWorkspaceTab = {
  id: WorkOrderJobWorkspaceTabId;
  label: string;
  module: WorkOrderWorkspaceModuleKey;
};

const WORK_ORDER_JOB_WORKSPACE_TABS: readonly WorkOrderJobWorkspaceTab[] = [
  { id: "overview", label: "Overview", module: "repairLines" },
  { id: "story", label: "Story", module: "repairLines" },
  { id: "inspection", label: "Inspection", module: "inspection" },
  { id: "parts", label: "Parts", module: "parts" },
  { id: "evidence", label: "Evidence", module: "documents" },
  { id: "details", label: "Details", module: "repairLines" },
];

export function getWorkOrderJobWorkspaceTabs(input: {
  inspectionAvailable: boolean;
}): readonly WorkOrderJobWorkspaceTab[] {
  return input.inspectionAvailable
    ? WORK_ORDER_JOB_WORKSPACE_TABS
    : WORK_ORDER_JOB_WORKSPACE_TABS.filter(
        (tab) => tab.id !== "inspection",
      );
}

export type WorkOrderWorkspaceResourceInput = {
  shopId: string | null | undefined;
  workOrderId: string | null | undefined;
  customerId?: string | null;
  vehicleId?: string | null;
  locationId?: string | null;
};

export function createWorkOrderWorkspaceResource({
  shopId,
  workOrderId,
  customerId = null,
  vehicleId = null,
  locationId = null,
}: WorkOrderWorkspaceResourceInput): WorkspaceResourceContext | null {
  const canonicalShopId = shopId?.trim() ?? "";
  const canonicalWorkOrderId = workOrderId?.trim() ?? "";
  if (!canonicalShopId || !canonicalWorkOrderId) return null;

  return {
    kind: "work_order",
    shopId: canonicalShopId,
    resourceId: canonicalWorkOrderId,
    workOrderId: canonicalWorkOrderId,
    customerId: customerId?.trim() || null,
    vehicleId: vehicleId?.trim() || null,
    locationId: locationId?.trim() || null,
  };
}

export function workOrderWorkspaceCustomerMessageHref({
  workOrderId,
  customerId,
  customerActive,
  customerArchivedAt = null,
  customerMergedIntoCustomerId = null,
}: Pick<WorkOrderWorkspaceResourceInput, "workOrderId" | "customerId"> & {
  customerActive: boolean | null | undefined;
  customerArchivedAt?: string | null;
  customerMergedIntoCustomerId?: string | null;
}): string | null {
  const canonicalWorkOrderId = workOrderId?.trim() ?? "";
  const canonicalCustomerId = customerId?.trim() ?? "";
  if (
    !canonicalWorkOrderId ||
    !canonicalCustomerId ||
    customerActive !== true ||
    Boolean(customerArchivedAt?.trim()) ||
    Boolean(customerMergedIntoCustomerId?.trim())
  ) {
    return null;
  }

  const handoff = new URLSearchParams({
    compose: "customer",
    contextType: "work_order",
    contextId: canonicalWorkOrderId,
    customerId: canonicalCustomerId,
  });
  return `/chat?${handoff.toString()}`;
}
