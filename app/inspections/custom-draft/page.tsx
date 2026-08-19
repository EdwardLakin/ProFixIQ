// Server component wrapper (no "use client")
import InspectionTemplateEditRouter from "@/features/inspections/components/InspectionTemplateEditRouter";
import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";
import { ROLE_GROUPS } from "@/features/shared/lib/rbac";

export const dynamic = "force-dynamic"; // optional, if you need runtime params each load
export default async function Page() {
  await requireShopPageAccess({
    allowRoles: ROLE_GROUPS.billingOperators,
    redirectTo: "/inspections/templates",
  });

  return <InspectionTemplateEditRouter />;
}
