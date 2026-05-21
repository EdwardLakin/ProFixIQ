import WorkforceDocumentsClient from "@/features/dashboard/app/dashboard/workforce/WorkforceDocumentsClient";
import { requireAdminPageAccess } from "@/features/shared/lib/server/admin-access";

export default async function WorkforceDocumentsPage() {
  await requireAdminPageAccess({ allow: ["owner", "admin"] });
  return <WorkforceDocumentsClient />;
}
