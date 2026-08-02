import OperationalHealthAlertStrip from "@/features/operations/components/OperationalHealthAlertStrip";
import { resolveAuthenticatedStaffProfile } from "@/features/shared/lib/server/admin-access";
import { canonicalizeRole } from "@/features/shared/lib/rbac";
import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";
import OperationsDashboardView from "../_components/OperationsDashboardView";

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
    <div className="space-y-4">
      {canViewObservability ? <OperationalHealthAlertStrip /> : null}
      <OperationsDashboardView />
    </div>
  );
}
