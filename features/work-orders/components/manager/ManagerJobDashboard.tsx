// features/dashboard/app/dashboard/manager/page.tsx
import { Suspense } from "react";
import ManagerJobDashboard from "@work-orders/components/manager/ManagerJobDashboard";
import { ROLE_GROUPS } from "@/features/shared/lib/rbac";
import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";

export const metadata = { title: "Manager Dashboard" };

export default async function ManagerDashboardPage() {
  await requireShopPageAccess({ allowRoles: ROLE_GROUPS.workOrderManagers });

  return (
    <Suspense fallback={<div className="p-4 text-[color:var(--theme-text-secondary)]">Loading Manager Dashboard…</div>}>
      <ManagerJobDashboard />
    </Suspense>
  );
}
