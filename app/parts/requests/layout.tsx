import type { ReactNode } from "react";
import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";
import { PARTS_REQUEST_ACCESS_ROLES } from "@/features/parts/server/loadPartsRequestQueue";
import CustomerPartsQuoteRequestsPanel from "@/features/parts/components/CustomerPartsQuoteRequestsPanel";

export default async function PartsRequestsLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireShopPageAccess({ allowRoles: PARTS_REQUEST_ACCESS_ROLES });

  return (
    <>
      <div className="w-full px-3 pt-3 sm:px-5 lg:px-8 xl:px-10">
        <CustomerPartsQuoteRequestsPanel />
      </div>
      {children}
    </>
  );
}
