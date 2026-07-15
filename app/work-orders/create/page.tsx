export const dynamic = "force-dynamic";
export const revalidate = 0;

import CreateWorkOrderPage from "@/features/work-orders/app/work-orders/create/page";
import { ROLE_GROUPS } from "@/features/shared/lib/rbac";
import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";

export default async function GuardedCreateWorkOrderPage() {
  await requireShopPageAccess({ allowRoles: ROLE_GROUPS.workOrderCreators });
  return <CreateWorkOrderPage />;
}
