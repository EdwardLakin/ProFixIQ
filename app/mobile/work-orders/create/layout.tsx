import { ROLE_GROUPS } from "@/features/shared/lib/rbac";
import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";

export default async function MobileCreateWorkOrderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireShopPageAccess({ allowRoles: ROLE_GROUPS.workOrderCreators });
  return children;
}
