import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@shared/types/types/supabase";
import type { MobileWorkOrderSnapshot } from "@/features/work-orders/mobile/mobileWorkOrderDetail";
import { loadRoleShapedWorkOrderDetail } from "@/features/work-orders/workspace/server/loadRoleShapedWorkOrderDetail";
import { WORK_ORDER_WORKSPACE_READER_ROLES } from "@/features/work-orders/workspace/server/loadWorkOrderWorkspaceSnapshot";

type DB = Database;

export const MOBILE_WORK_ORDER_DETAIL_ROLES = WORK_ORDER_WORKSPACE_READER_ROLES;

/**
 * Mobile consumes the same authorization-first, role-shaped projection as the
 * desktop workspace. The trusted data client is never exposed to the browser.
 */
export async function loadMobileWorkOrderDetail(input: {
  supabase: SupabaseClient<DB>;
  dataSupabase: SupabaseClient<DB>;
  profileId: string;
  shopId: string;
  routeId: string;
}): Promise<MobileWorkOrderSnapshot | null> {
  return loadRoleShapedWorkOrderDetail({
    authorizationSupabase: input.supabase,
    dataSupabase: input.dataSupabase,
    profileId: input.profileId,
    shopId: input.shopId,
    routeId: input.routeId,
  });
}
