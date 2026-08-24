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
