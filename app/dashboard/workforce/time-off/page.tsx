import { redirect } from "next/navigation";
import { requireAdminPageAccess } from "@/features/shared/lib/server/admin-access";

export default async function WorkforceTimeOffPage() {
  await requireAdminPageAccess({ allow: ["owner", "admin", "manager"] });
  redirect("/dashboard/workforce/scheduling?focus=time-off&status=pending");
}
