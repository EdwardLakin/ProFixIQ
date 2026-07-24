import { Suspense } from "react";
import FeaturePage from "@/features/dashboard/app/dashboard/owner/reports/page";
import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";

export default async function Page() {
  await requireShopPageAccess({
    requiredCapability: "canViewFinancials",
    allowRoles: ["owner", "admin", "manager"],
  });
  return (
    <Suspense fallback={<div className="p-6 text-[color:var(--theme-text-primary)]">Loading…</div>}>
      <FeaturePage />
    </Suspense>
  );
}
