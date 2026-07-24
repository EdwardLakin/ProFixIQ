import AuditClient from "@/features/dashboard/app/dashboard/admin/AuditClient";
import { requireAdminPageAccess } from "@/features/shared/lib/server/admin-access";

export default async function WorkforceActivityPage() {
  await requireAdminPageAccess({ allow: ["owner", "admin"] });
  return <AuditClient />;
}
