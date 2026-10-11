export const dynamic = "force-dynamic";
export const revalidate = 0;

import { Suspense } from "react";
import FeaturePage from "@/features/inspections/app/inspection/custom-inspection/page";
import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";
import { ROLE_GROUPS } from "@/features/shared/lib/rbac";

export default async function Page() {
  await requireShopPageAccess({
    allowRoles: ROLE_GROUPS.billingOperators,
    redirectTo: "/inspections/templates",
  });

  return (
    <Suspense
      fallback={
        <div className="flex min-h-[320px] items-center justify-center text-sm text-[color:var(--theme-text-secondary)]">
          Loading inspection builder…
        </div>
      }
    >
      <FeaturePage />
    </Suspense>
  );
}
