import OperationalHealthAlertStrip from "@/features/operations/components/OperationalHealthAlertStrip";
import { requireActiveDemoAccessForPage } from "@/features/shared/lib/server/admin-access";
import { canonicalizeRole } from "@/features/shared/lib/rbac";
import OperationsDashboardView from "../_components/OperationsDashboardView";
import OperationsDashboardFreshness from "../_components/OperationsDashboardFreshness";

export default async function OperationsDashboardPage() {
  // Only auth + demo-expiry are enforced here, matching this route's prior
  // tolerance for a missing profile or an unrecognized role (it renders
  // without OperationalHealthAlertStrip rather than redirecting); the full
  // requireShopPageAccess() role gate would instead bounce those profiles
  // to /dashboard, a behavior change for non-demo users this fix must not make.
  const profile = await requireActiveDemoAccessForPage();
  const role = canonicalizeRole(profile?.role);
  const canViewObservability = ["owner", "admin", "manager"].includes(role);

  return (
    <OperationsDashboardFreshness shopId={profile?.shop_id ?? null}>
      {canViewObservability ? <OperationalHealthAlertStrip /> : null}
      <OperationsDashboardView />
    </OperationsDashboardFreshness>
  );
}
