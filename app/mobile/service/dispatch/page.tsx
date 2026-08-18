import DispatchBoardClient from "app/dashboard/dispatch/DispatchBoardClient";
import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";

export const dynamic = "force-dynamic";

export default async function FieldDispatchPage() {
  await requireShopPageAccess({
    requiredCapability: "canManageScheduling",
    redirectTo: "/mobile/service",
  });

  return <DispatchBoardClient surface="field" />;
}
