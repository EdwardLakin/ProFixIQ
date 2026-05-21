import WorkforceCertificationsClient from "@/features/dashboard/app/dashboard/workforce/WorkforceCertificationsClient";
import { requireAdminPageAccess } from "@/features/shared/lib/server/admin-access";

export default async function WorkforceCertificationsPage() {
  await requireAdminPageAccess({ allow: ["owner", "admin"] });
  return <WorkforceCertificationsClient />;
}
