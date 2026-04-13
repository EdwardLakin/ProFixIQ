import EmployeeDocsClient from "@/features/dashboard/app/dashboard/admin/EmployeeDocsClient";
import { requireAdminPageAccess } from "@/features/shared/lib/server/admin-access";

export default async function Page() {
  await requireAdminPageAccess({ allow: ["owner", "admin"] });
  return <EmployeeDocsClient />;
}
