export const WORKSPACE_CAPABILITIES = {
  manageTeamPermissions: "team.permissions.manage",
  manageWorkOrderAssignments: "work_order.assignment.manage",
  viewWorkOrderSellPricing: "work_order.financial.sell.view",
  viewWorkOrderCost: "work_order.financial.cost.view",
  viewWorkOrderGrossProfit: "work_order.financial.gp.view",
  viewWorkOrderInvoice: "work_order.invoice.view",
  manageWorkOrderInvoice: "work_order.invoice.manage",
  editWorkOrderPricing: "work_order.pricing.edit",
  viewWorkOrderPartsSellPricing: "work_order.parts.sell.view",
  viewWorkOrderPartsCost: "work_order.parts.cost.view",
  operateParts: "parts.operate",
  managePartsDesk: "parts.desk.manage",
  requestParts: "parts.request",
  orderParts: "parts.order",
  receiveParts: "parts.receive",
} as const;

export type WorkspaceCapabilityKey =
  (typeof WORKSPACE_CAPABILITIES)[keyof typeof WORKSPACE_CAPABILITIES];

export type WorkspaceCapabilityAccessLevel = "view" | "manage";

/**
 * Business-language presentation for the canonical capability catalog.
 *
 * Capability keys are long-lived security contracts, so the label/description
 * here never becomes the identifier. Administration screens must show these
 * strings rather than the key, and the group order below is the order shops
 * see in Settings and on an employee record.
 */
export type WorkspaceCapabilityGroupId =
  | "work_orders"
  | "parts"
  | "estimates"
  | "financials"
  | "invoices"
  | "team";

export const WORKSPACE_CAPABILITY_GROUPS: ReadonlyArray<{
  id: WorkspaceCapabilityGroupId;
  label: string;
  description: string;
}> = [
  {
    id: "work_orders",
    label: "Work Orders",
    description: "Scheduling repair work onto the floor.",
  },
  {
    id: "parts",
    label: "Parts",
    description: "Requesting, purchasing, and receiving parts.",
  },
  {
    id: "estimates",
    label: "Estimates & Approvals",
    description: "Customer-facing pricing on quotes and work orders.",
  },
  {
    id: "financials",
    label: "Financials",
    description: "Internal cost and profit visibility.",
  },
  {
    id: "invoices",
    label: "Invoices",
    description: "Issuing and collecting on customer invoices.",
  },
  {
    id: "team",
    label: "Team",
    description: "Who can change what other people are allowed to do.",
  },
];

export type WorkspaceCapabilityDescriptor = {
  capabilityKey: WorkspaceCapabilityKey;
  accessLevel: WorkspaceCapabilityAccessLevel;
  group: WorkspaceCapabilityGroupId;
  label: string;
  description: string;
};

export const WORKSPACE_CAPABILITY_CATALOG: ReadonlyArray<WorkspaceCapabilityDescriptor> =
  [
    {
      capabilityKey: WORKSPACE_CAPABILITIES.manageWorkOrderAssignments,
      accessLevel: "manage",
      group: "work_orders",
      label: "Assign work",
      description: "Assign or reassign repair work to technicians.",
    },
    {
      capabilityKey: WORKSPACE_CAPABILITIES.requestParts,
      accessLevel: "manage",
      group: "parts",
      label: "Request parts",
      description: "Ask the parts desk for parts on a job.",
    },
    {
      capabilityKey: WORKSPACE_CAPABILITIES.operateParts,
      accessLevel: "manage",
      group: "parts",
      label: "Use parts on jobs",
      description:
        "Add, consume, and adjust parts on repair jobs through the parts workflow.",
    },
    {
      capabilityKey: WORKSPACE_CAPABILITIES.managePartsDesk,
      accessLevel: "manage",
      group: "parts",
      label: "Run the parts desk",
      description:
        "Pick, allocate, issue, and return parts, and manage part requests.",
    },
    {
      capabilityKey: WORKSPACE_CAPABILITIES.orderParts,
      accessLevel: "manage",
      group: "parts",
      label: "Order parts",
      description: "Place purchase orders with suppliers.",
    },
    {
      capabilityKey: WORKSPACE_CAPABILITIES.receiveParts,
      accessLevel: "manage",
      group: "parts",
      label: "Receive parts",
      description: "Receive parts against a purchase order or request.",
    },
    {
      capabilityKey: WORKSPACE_CAPABILITIES.viewWorkOrderPartsSellPricing,
      accessLevel: "view",
      group: "parts",
      label: "See part prices",
      description: "See the price a customer is charged for a part.",
    },
    {
      capabilityKey: WORKSPACE_CAPABILITIES.viewWorkOrderPartsCost,
      accessLevel: "view",
      group: "parts",
      label: "See part cost",
      description: "See what the shop paid for a part.",
    },
    {
      capabilityKey: WORKSPACE_CAPABILITIES.viewWorkOrderSellPricing,
      accessLevel: "view",
      group: "estimates",
      label: "See customer pricing",
      description: "See estimate and work-order totals as the customer sees them.",
    },
    {
      capabilityKey: WORKSPACE_CAPABILITIES.editWorkOrderPricing,
      accessLevel: "manage",
      group: "estimates",
      label: "Edit customer pricing",
      description: "Change the prices quoted to a customer.",
    },
    {
      capabilityKey: WORKSPACE_CAPABILITIES.viewWorkOrderCost,
      accessLevel: "view",
      group: "financials",
      label: "See internal cost",
      description: "See what the shop pays in labor and parts cost.",
    },
    {
      capabilityKey: WORKSPACE_CAPABILITIES.viewWorkOrderGrossProfit,
      accessLevel: "view",
      group: "financials",
      label: "See gross profit",
      description: "See gross profit and margin on repair work.",
    },
    {
      capabilityKey: WORKSPACE_CAPABILITIES.viewWorkOrderInvoice,
      accessLevel: "view",
      group: "invoices",
      label: "See invoices",
      description: "Open the invoice for a completed work order.",
    },
    {
      capabilityKey: WORKSPACE_CAPABILITIES.manageWorkOrderInvoice,
      accessLevel: "manage",
      group: "invoices",
      label: "Issue and collect invoices",
      description: "Review, issue, send, and take payment on an invoice.",
    },
    {
      capabilityKey: WORKSPACE_CAPABILITIES.manageTeamPermissions,
      accessLevel: "manage",
      group: "team",
      label: "Manage permissions",
      description:
        "Change what roles and individual employees are allowed to do.",
    },
  ];

export const WORKSPACE_CAPABILITY_KEYS = WORKSPACE_CAPABILITY_CATALOG.map(
  (descriptor) => descriptor.capabilityKey,
);

const CATALOG_BY_KEY = new Map<
  WorkspaceCapabilityKey,
  WorkspaceCapabilityDescriptor
>(WORKSPACE_CAPABILITY_CATALOG.map((entry) => [entry.capabilityKey, entry]));

export function workspaceCapabilityDescriptor(
  capabilityKey: WorkspaceCapabilityKey,
): WorkspaceCapabilityDescriptor {
  const descriptor = CATALOG_BY_KEY.get(capabilityKey);
  if (!descriptor) {
    throw new Error(`Unknown workspace capability: ${capabilityKey}`);
  }
  return descriptor;
}

export function isWorkspaceCapabilityKey(
  value: unknown,
): value is WorkspaceCapabilityKey {
  return typeof value === "string" && CATALOG_BY_KEY.has(value as WorkspaceCapabilityKey);
}

export type WorkspaceCapabilityDecisionSource =
  | "individual_override"
  | "shop_role_policy"
  | "profixiq_preset"
  | "unavailable";

export type WorkspaceCapabilityDecision = {
  capabilityKey: WorkspaceCapabilityKey;
  accessLevel: WorkspaceCapabilityAccessLevel;
  granted: boolean;
  source: WorkspaceCapabilityDecisionSource;
};

export type EffectiveWorkspaceCapabilities = Record<
  WorkspaceCapabilityKey,
  WorkspaceCapabilityDecision
>;

/**
 * Fail-closed starting point for every resolution path.
 *
 * A capability that is missing from a decision payload stays denied rather
 * than falling back to a role guess.
 */
export function createDeniedWorkspaceCapabilities(): EffectiveWorkspaceCapabilities {
  const denied = {} as EffectiveWorkspaceCapabilities;
  for (const descriptor of WORKSPACE_CAPABILITY_CATALOG) {
    denied[descriptor.capabilityKey] = {
      capabilityKey: descriptor.capabilityKey,
      accessLevel: descriptor.accessLevel,
      granted: false,
      source: "unavailable",
    };
  }
  return denied;
}

export type WorkspaceCapabilityEffect = "inherit" | "allow" | "deny";

export const WORKSPACE_CAPABILITY_EFFECTS: readonly WorkspaceCapabilityEffect[] =
  ["inherit", "allow", "deny"];

export function isWorkspaceCapabilityEffect(
  value: unknown,
): value is WorkspaceCapabilityEffect {
  return (
    typeof value === "string" &&
    (WORKSPACE_CAPABILITY_EFFECTS as readonly string[]).includes(value)
  );
}
