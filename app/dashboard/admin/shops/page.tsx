import ShopsClient from "@/features/dashboard/app/dashboard/admin/ShopsClient";
import { requireAdminPageAccess } from "@/features/shared/lib/server/admin-access";

export default async function Page() {
  await requireAdminPageAccess({ allow: ["owner", "admin"] });
  return <ShopsClient />;
}
