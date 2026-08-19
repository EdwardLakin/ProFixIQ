export const dynamic = "force-dynamic";
export const revalidate = 0;

import FeaturePage from "@/features/inspections/app/inspection/created/page";
import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";
import { ROLE_GROUPS } from "@/features/shared/lib/rbac";

export default async function Page() {
  await requireShopPageAccess({
    allowRoles: ROLE_GROUPS.billingOperators,
    redirectTo: "/inspections/templates",
  });

  return <FeaturePage />;
}
