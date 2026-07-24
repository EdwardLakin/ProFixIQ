import type { ReactNode } from "react";
import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";

const PARTS_REQUEST_ACCESS_ROLES = ["owner", "admin", "manager", "parts"] as const;

export default async function PartsRequestsLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireShopPageAccess({ allowRoles: PARTS_REQUEST_ACCESS_ROLES });

  return <>{children}</>;
}
