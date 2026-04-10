import { getActorCapabilities } from "@/features/shared/lib/rbac";

export function capabilities(role: string | null) {
  const actor = getActorCapabilities({ role });
  return {
    canView: actor.canManageWorkOrders || actor.canViewShopWideData,
    canEditWoMeta: actor.canManageWorkOrders,
    canTechOps: actor.canRunInspections,
    canAddJobs: actor.canManageWorkOrders,
    canGenerateQuote: actor.canAuthorizeQuotes,
  } as const;
}
