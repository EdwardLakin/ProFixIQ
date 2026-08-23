import OperationalHealthAlertStrip from "@/features/operations/components/OperationalHealthAlertStrip";
import { resolveAuthenticatedStaffProfile } from "@/features/shared/lib/server/admin-access";
import { canonicalizeRole } from "@/features/shared/lib/rbac";
import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";
import OperationsDashboardView from "../_components/OperationsDashboardView";
import OperationsDashboardFreshness from "../_components/OperationsDashboardFreshness";

export default async function OperationsDashboardPage() {
  const supabase = createServerSupabaseRSC();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { profile } = user
    ? await resolveAuthenticatedStaffProfile(supabase, user.id)
    : { profile: null };
  const role = canonicalizeRole(profile?.role);
  const canViewObservability = ["owner", "admin", "manager"].includes(role);

  return (
    <OperationsDashboardFreshness shopId={profile?.shop_id ?? null}>
      {canViewObservability ? <OperationalHealthAlertStrip /> : null}
      <OperationsDashboardView />
    </OperationsDashboardFreshness>
  );
}
