import OperationalHealthAlertStrip from "@/features/operations/components/OperationalHealthAlertStrip";
import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";
import OperationsDashboardView from "../_components/OperationsDashboardView";
import OperationsDashboardFreshness from "../_components/OperationsDashboardFreshness";

export default async function OperationsDashboardPage() {
  const { profile, canonicalRole } = await requireShopPageAccess({});
  const canViewObservability = ["owner", "admin", "manager"].includes(
    canonicalRole,
  );

  return (
    <OperationsDashboardFreshness shopId={profile.shop_id}>
      {canViewObservability ? <OperationalHealthAlertStrip /> : null}
      <OperationsDashboardView />
    </OperationsDashboardFreshness>
  );
}
