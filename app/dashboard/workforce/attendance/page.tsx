import { requireAdminPageAccess } from "@/features/shared/lib/server/admin-access";
import { AttendanceOverviewClient } from "@/features/dashboard/app/dashboard/workforce/AttendanceOverviewClient";

export default async function WorkforceAttendancePage() {
  await requireAdminPageAccess({ allow: ["owner", "admin", "manager"] });

  return <AttendanceOverviewClient />;
}
