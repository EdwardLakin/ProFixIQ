import type { Session } from "@supabase/supabase-js";
import {
  createDashboardServerClient,
  getDashboardIdentity,
  type DashboardIdentity,
  type DashboardServerClient,
} from "@/features/dashboard/server/dashboard-shell-data";

export type RootShellContext = {
  session: Session | null;
  dashboardIdentity: DashboardIdentity;
};

export async function resolveRootShellContext(
  supabase: DashboardServerClient = createDashboardServerClient(),
): Promise<RootShellContext> {
  const dashboardIdentity = await getDashboardIdentity(supabase);
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const validatedSession =
    dashboardIdentity.userId && session?.user.id === dashboardIdentity.userId
      ? session
      : null;

  return { session: validatedSession, dashboardIdentity };
}
