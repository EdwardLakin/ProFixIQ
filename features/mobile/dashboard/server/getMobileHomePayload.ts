import "server-only";

import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { getOperationsDashboardPayload } from "@/features/dashboard/server/getOperationsDashboardPayload";
import {
  canonicalizeRole,
  type CanonicalRole,
} from "@/features/shared/lib/rbac";
import { ACTIVE_WORK_ORDER_STATUSES } from "@/features/work-orders/lib/work-order-status";

export type MobileHomePayload = {
  role: CanonicalRole;
  advisor: {
    awaitingApprovals: number;
    activeWos: number;
    waiters: number;
    appointmentsToday: number;
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
      advisor: {
        awaitingApprovals: 0,
        activeWos: 0,
        waiters: 0,
        appointmentsToday: 0,
      },
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

  let activeWos = 0;
  let waiters = 0;

  if (shopId) {
    const [activeResult, waiterResult] = await Promise.all([
      supabase
        .from("work_orders")
        .select("id", { count: "exact", head: true })
        .eq("shop_id", shopId)
        .in("status", [...ACTIVE_WORK_ORDER_STATUSES]),
      supabase
        .from("work_orders")
        .select("id", { count: "exact", head: true })
        .eq("shop_id", shopId)
        .eq("is_waiter", true)
        .in("status", [...ACTIVE_WORK_ORDER_STATUSES]),
    ]);

    if (activeResult.error || waiterResult.error) {
      throw new Error("The current work-order count could not be loaded.");
    }

    activeWos = activeResult.count ?? 0;
    waiters = waiterResult.count ?? 0;
  }

  return {
    role,
    advisor: {
      awaitingApprovals: ops.topSummary.waitingApprovals,
      activeWos,
      waiters,
      appointmentsToday: ops.topSummary.appointmentsToday,
    },
    manager: {
      activeWos,
      waiters,
      techniciansOnShift: ops.technicianActivity.length,
    },
    leadhand: {
      techsOnShift: ops.technicianActivity.length,
      jobsInProgress: activeWos,
      jobsBlocked: ops.topSummary.blockedJobs,
    },
  };
}
