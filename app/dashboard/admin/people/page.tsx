import WorkforceRelocationNotice from "@/features/dashboard/app/dashboard/workforce/WorkforceRelocationNotice";
import PeoplePageClient from "@/features/dashboard/app/dashboard/admin/PeoplePageClient";
import { requireAdminPageAccess } from "@/features/shared/lib/server/admin-access";

export default async function Page() {
  await requireAdminPageAccess({ allow: ["owner", "admin"] });
  return <><WorkforceRelocationNotice href="/dashboard/workforce/people" /><PeoplePageClient /></>;
}
