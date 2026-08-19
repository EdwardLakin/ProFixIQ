import FieldInvoicesHistory from "@/features/mobile/service/FieldInvoicesHistory";
import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";

export const dynamic = "force-dynamic";

export default async function FieldInvoicesHistoryPage() {
  await requireShopPageAccess({
    requiredCapability: "canManageWorkOrders",
    redirectTo: "/mobile/service",
  });

  return <FieldInvoicesHistory />;
}
