import WorkOrderBoard from "@shared/components/workboard/WorkOrderBoard";
import { OperationalViewSwitcher } from "@/features/dashboard/components/OperationalViewSwitcher";
import { getDashboardIdentity } from "@/features/dashboard/server/dashboard-shell-data";
import { parseWorkOrderBoardStageFilter } from "@shared/lib/workboard/filters";
import { ROLE_GROUPS } from "@/features/shared/lib/rbac";
import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";

export default async function WorkOrderBoardPage({
  searchParams,
}: {
  searchParams?: Promise<{ stage?: string | string[] }>;
}) {
  await requireShopPageAccess({ allowRoles: ROLE_GROUPS.shopWideOperators });
  const identity = await getDashboardIdentity();
  const params = await searchParams;
  const rawStage = Array.isArray(params?.stage)
    ? params?.stage[0]
    : params?.stage;
  const initialStage = parseWorkOrderBoardStageFilter(rawStage);
  return (
    <main className="min-h-screen px-4 py-5 text-[color:var(--theme-text-primary)] md:px-6">
      <div className="mx-auto w-full max-w-[1800px] space-y-4">
        <OperationalViewSwitcher role={identity.role} />
        <WorkOrderBoard
          variant="shop"
          title="Work Order Board"
          initialStage={initialStage}
        />
      </div>
    </main>
  );
}
