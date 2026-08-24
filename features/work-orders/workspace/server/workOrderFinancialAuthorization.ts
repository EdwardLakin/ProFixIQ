import "server-only";

import {
  WORKSPACE_CAPABILITIES,
  type WorkspaceCapabilityKey,
} from "@/features/workspace/authorization/capabilities";
import { resolveCurrentWorkspaceCapabilities } from "@/features/workspace/authorization/server/resolveWorkspaceCapabilities";

export const WORK_ORDER_FINANCIAL_CAPABILITY_KEYS = [
  WORKSPACE_CAPABILITIES.viewWorkOrderSellPricing,
  WORKSPACE_CAPABILITIES.viewWorkOrderCost,
  WORKSPACE_CAPABILITIES.viewWorkOrderGrossProfit,
  WORKSPACE_CAPABILITIES.viewWorkOrderInvoice,
  WORKSPACE_CAPABILITIES.manageWorkOrderInvoice,
  WORKSPACE_CAPABILITIES.editWorkOrderPricing,
  WORKSPACE_CAPABILITIES.viewWorkOrderPartsSellPricing,
  WORKSPACE_CAPABILITIES.viewWorkOrderPartsCost,
] as const satisfies readonly WorkspaceCapabilityKey[];

export type WorkOrderFinancialAccess = {
  canViewSellPricing: boolean;
  canViewCost: boolean;
  canViewGrossProfit: boolean;
  canViewInvoice: boolean;
  canManageInvoice: boolean;
  canEditPricing: boolean;
  canViewPartsSellPricing: boolean;
  canViewPartsCost: boolean;
};

export function deniedWorkOrderFinancialAccess(): WorkOrderFinancialAccess {
  return {
    canViewSellPricing: false,
    canViewCost: false,
    canViewGrossProfit: false,
    canViewInvoice: false,
    canManageInvoice: false,
    canEditPricing: false,
    canViewPartsSellPricing: false,
    canViewPartsCost: false,
  };
}

/**
 * Resolves the complete Work Order financial envelope in one fail-closed call.
 * Derived permissions intentionally require their prerequisite visibility so a
 * stale or contradictory policy cannot expose GP, editing, or invoice actions
 * without the underlying view access.
 */
export async function resolveWorkOrderFinancialAccess(input: {
  supabase: unknown;
  profileId: string;
  shopId: string;
}): Promise<{
  access: WorkOrderFinancialAccess;
  error: string | null;
}> {
  const result = await resolveCurrentWorkspaceCapabilities({
    supabase: input.supabase,
    profileId: input.profileId,
    shopId: input.shopId,
    capabilityKeys: WORK_ORDER_FINANCIAL_CAPABILITY_KEYS,
  });
  if (result.error) {
    return {
      access: deniedWorkOrderFinancialAccess(),
      error: result.error,
    };
  }

  const granted = (key: WorkspaceCapabilityKey): boolean =>
    result.capabilities[key].granted;

  const canViewSellPricing = granted(
    WORKSPACE_CAPABILITIES.viewWorkOrderSellPricing,
  );
  const canViewCost = granted(WORKSPACE_CAPABILITIES.viewWorkOrderCost);
  const canViewInvoice = granted(WORKSPACE_CAPABILITIES.viewWorkOrderInvoice);
  const canViewPartsSellPricing = granted(
    WORKSPACE_CAPABILITIES.viewWorkOrderPartsSellPricing,
  );
  const canViewPartsCost = granted(
    WORKSPACE_CAPABILITIES.viewWorkOrderPartsCost,
  );

  return {
    access: {
      canViewSellPricing,
      canViewCost,
      canViewGrossProfit:
        canViewSellPricing &&
        canViewCost &&
        granted(WORKSPACE_CAPABILITIES.viewWorkOrderGrossProfit),
      canViewInvoice,
      canManageInvoice:
        canViewInvoice &&
        granted(WORKSPACE_CAPABILITIES.manageWorkOrderInvoice),
      canEditPricing:
        canViewSellPricing &&
        granted(WORKSPACE_CAPABILITIES.editWorkOrderPricing),
      canViewPartsSellPricing,
      canViewPartsCost,
    },
    error: null,
  };
}
