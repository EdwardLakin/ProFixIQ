import type { WorkspaceResourceContext } from "@/features/workspace/lib/workspace";

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
