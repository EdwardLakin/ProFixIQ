import PeoplePageClient from "@/features/dashboard/app/dashboard/admin/PeoplePageClient";
import { requireAdminPageAccess } from "@/features/shared/lib/server/admin-access";

export default async function WorkforcePeoplePage() {
  await requireAdminPageAccess({ allow: ["owner", "admin"] });
  return <PeoplePageClient />;
}
