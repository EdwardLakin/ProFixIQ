import WorkforceRelocationNotice from "@/features/dashboard/app/dashboard/workforce/WorkforceRelocationNotice";
import { requireAdminPageAccess } from "@/features/shared/lib/server/admin-access";
import WorkforceSchedulingClient from "@/features/dashboard/app/dashboard/admin/scheduling/WorkforceSchedulingClient";

export default async function Page() {
  await requireAdminPageAccess({ allow: ["owner", "admin", "manager"] });
  return <><WorkforceRelocationNotice href="/dashboard/workforce/scheduling" /><WorkforceSchedulingClient /></>;
}
