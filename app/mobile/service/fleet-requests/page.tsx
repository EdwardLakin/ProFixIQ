import { redirect } from "next/navigation";
import ShopFleetRequestInbox from "@/features/fleet/components/ShopFleetRequestInbox";
import { canAcceptFleetServiceRequests } from "@/features/fleet/lib/shopFleetRequestIntake";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

export const dynamic = "force-dynamic";

export default async function FieldFleetRequestsPage() {
  const access = await requireShopScopedApiAccess();
  if (!access.ok || !(await canAcceptFleetServiceRequests(access))) {
    redirect("/mobile/service");
  }

  return <ShopFleetRequestInbox workOrderBasePath="/mobile/work-orders" />;
}
