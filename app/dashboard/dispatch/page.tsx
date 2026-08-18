import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";
import DispatchBoardClient from "./DispatchBoardClient";

export default async function DispatchPage() {
  await requireShopPageAccess({ requiredCapability: "canManageScheduling" });
  return <DispatchBoardClient />;
}
