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
} as const;

export type WorkspaceCapabilityKey =
  (typeof WORKSPACE_CAPABILITIES)[keyof typeof WORKSPACE_CAPABILITIES];

export const WORKSPACE_CAPABILITY_KEYS = Object.values(
  WORKSPACE_CAPABILITIES,
) as WorkspaceCapabilityKey[];

export type WorkspaceCapabilityDecisionSource =
  | "individual_override"
  | "shop_role_policy"
  | "profixiq_preset"
  | "unavailable";

export type WorkspaceCapabilityDecision = {
  capabilityKey: WorkspaceCapabilityKey;
  accessLevel: "view" | "manage";
  granted: boolean;
  source: WorkspaceCapabilityDecisionSource;
};

export type EffectiveWorkspaceCapabilities = Record<
  WorkspaceCapabilityKey,
  WorkspaceCapabilityDecision
>;

function deniedDecision(
  capabilityKey: WorkspaceCapabilityKey,
  accessLevel: "view" | "manage",
): WorkspaceCapabilityDecision {
  return {
    capabilityKey,
    accessLevel,
    granted: false,
    source: "unavailable",
  };
}

export function createDeniedWorkspaceCapabilities(): EffectiveWorkspaceCapabilities {
  return {
    [WORKSPACE_CAPABILITIES.manageTeamPermissions]: deniedDecision(
      WORKSPACE_CAPABILITIES.manageTeamPermissions,
      "manage",
    ),
    [WORKSPACE_CAPABILITIES.manageWorkOrderAssignments]: deniedDecision(
      WORKSPACE_CAPABILITIES.manageWorkOrderAssignments,
      "manage",
    ),
    [WORKSPACE_CAPABILITIES.viewWorkOrderSellPricing]: deniedDecision(
      WORKSPACE_CAPABILITIES.viewWorkOrderSellPricing,
      "view",
    ),
    [WORKSPACE_CAPABILITIES.viewWorkOrderCost]: deniedDecision(
      WORKSPACE_CAPABILITIES.viewWorkOrderCost,
      "view",
    ),
    [WORKSPACE_CAPABILITIES.viewWorkOrderGrossProfit]: deniedDecision(
      WORKSPACE_CAPABILITIES.viewWorkOrderGrossProfit,
      "view",
    ),
    [WORKSPACE_CAPABILITIES.viewWorkOrderInvoice]: deniedDecision(
      WORKSPACE_CAPABILITIES.viewWorkOrderInvoice,
      "view",
    ),
    [WORKSPACE_CAPABILITIES.manageWorkOrderInvoice]: deniedDecision(
      WORKSPACE_CAPABILITIES.manageWorkOrderInvoice,
      "manage",
    ),
    [WORKSPACE_CAPABILITIES.editWorkOrderPricing]: deniedDecision(
      WORKSPACE_CAPABILITIES.editWorkOrderPricing,
      "manage",
    ),
    [WORKSPACE_CAPABILITIES.viewWorkOrderPartsSellPricing]: deniedDecision(
      WORKSPACE_CAPABILITIES.viewWorkOrderPartsSellPricing,
      "view",
    ),
    [WORKSPACE_CAPABILITIES.viewWorkOrderPartsCost]: deniedDecision(
      WORKSPACE_CAPABILITIES.viewWorkOrderPartsCost,
      "view",
    ),
  };
}
