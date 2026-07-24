import PerformanceDashboardView from "../_components/PerformanceDashboardView";
import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";

export default async function PerformanceDashboardPage() {
  await requireShopPageAccess({
    requiredCapability: "canViewFinancials",
    allowRoles: ["owner", "admin", "manager"],
  });
  return <PerformanceDashboardView />;
}
