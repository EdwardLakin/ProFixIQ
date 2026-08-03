import { redirect } from "next/navigation";

import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";

export default async function TechnicianReportsRedirect() {
  await requireShopPageAccess({
    requiredCapability: "canViewFinancials",
    allowRoles: ["owner", "admin", "manager"],
  });
  redirect("/dashboard/owner/reports?section=workforce");
}
