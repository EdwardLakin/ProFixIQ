export const dynamic = "force-dynamic";
export const revalidate = 0;

import WorkOrdersView from "@/features/work-orders/app/work-orders/view/page";
import { ROLE_GROUPS } from "@/features/shared/lib/rbac";
import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";

export default async function GuardedWorkOrdersViewPage() {
  await requireShopPageAccess({ allowRoles: ROLE_GROUPS.shopWideOperators });
  return <WorkOrdersView />;
}
