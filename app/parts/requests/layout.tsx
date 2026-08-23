import type { ReactNode } from "react";
import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";
import { PARTS_REQUEST_ACCESS_ROLES } from "@/features/parts/server/loadPartsRequestQueue";

export default async function PartsRequestsLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireShopPageAccess({ allowRoles: PARTS_REQUEST_ACCESS_ROLES });

  return <>{children}</>;
}
