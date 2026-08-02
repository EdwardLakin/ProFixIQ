export const dynamic = "force-dynamic";
export const revalidate = 0;

import EstimatesWorkspace from "@/features/estimates/components/EstimatesWorkspace";
import { ESTIMATE_VIEW_ROLES } from "@/features/estimates/lib/access";
import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";

export default async function EstimatesPage() {
  await requireShopPageAccess({ allowRoles: ESTIMATE_VIEW_ROLES });
  return <EstimatesWorkspace />;
}
