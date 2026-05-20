import WorkforceSchedulingClient from "@/features/dashboard/app/dashboard/admin/scheduling/WorkforceSchedulingClient";
import { requireAdminPageAccess } from "@/features/shared/lib/server/admin-access";

export default async function WorkforceSchedulingPage() {
  await requireAdminPageAccess({ allow: ["owner", "admin", "manager"] });
  return <WorkforceSchedulingClient />;
}
