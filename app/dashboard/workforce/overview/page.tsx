import WorkforceOverviewClient from "@/features/dashboard/app/dashboard/workforce/WorkforceOverviewClient";
import { requireAdminPageAccess } from "@/features/shared/lib/server/admin-access";

export default async function WorkforceOverviewPage() {
  await requireAdminPageAccess({ allow: ["owner", "admin", "manager"] });
  return <WorkforceOverviewClient />;
}
