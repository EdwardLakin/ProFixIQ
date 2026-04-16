import "server-only";

import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { getOperationsDashboardPayload } from "@/features/dashboard/server/getOperationsDashboardPayload";
import { canonicalizeRole, type CanonicalRole } from "@/features/shared/lib/rbac";

export type MobileHomePayload = {
  role: CanonicalRole;
  advisor: {
    awaitingApprovals: number;
    waiters: number;
    callbacks: number;
  };
  manager: {
    activeWos: number;
    waiters: number;
    techniciansOnShift: number;
  };
  leadhand: {
    techsOnShift: number;
    jobsInProgress: number;
    jobsBlocked: number;
  };
};

export async function getMobileHomePayload(): Promise<MobileHomePayload> {
  const supabase = createServerSupabaseRoute();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      role: "unknown",
      advisor: { awaitingApprovals: 0, waiters: 0, callbacks: 0 },
      manager: { activeWos: 0, waiters: 0, techniciansOnShift: 0 },
      leadhand: { techsOnShift: 0, jobsInProgress: 0, jobsBlocked: 0 },
    };
  }

  const [{ data: profile }, ops] = await Promise.all([
    supabase
      .from("profiles")
      .select("role, shop_id")
      .eq("id", user.id)
      .maybeSingle(),
    getOperationsDashboardPayload(),
  ]);

  const role = canonicalizeRole(profile?.role ?? null);
  const shopId = profile?.shop_id ?? ops.identity.shopId;

  let callbacks = 0;
  let quotePending = 0;

  if (shopId) {
    const [{ count: callbackCount }, { count: quoteCount }] = await Promise.all([
      supabase
        .from("followups")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("sent", false),
      supabase
        .from("work_order_quote_lines")
        .select("id", { count: "exact", head: true })
        .eq("shop_id", shopId)
        .not("status", "in", "('converted','declined')"),
    ]);

    callbacks = callbackCount ?? 0;
    quotePending = quoteCount ?? 0;
  }

  return {
    role,
    advisor: {
      awaitingApprovals: ops.topSummary.waitingApprovals,
      waiters: quotePending,
      callbacks,
    },
    manager: {
      activeWos: ops.topSummary.activeJobs,
      waiters: ops.topSummary.blockedJobs,
      techniciansOnShift: ops.technicianActivity.length,
    },
    leadhand: {
      techsOnShift: ops.technicianActivity.length,
      jobsInProgress: ops.topSummary.activeJobs,
      jobsBlocked: ops.topSummary.blockedJobs,
    },
  };
}
