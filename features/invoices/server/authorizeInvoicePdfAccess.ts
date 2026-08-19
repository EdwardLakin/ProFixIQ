import "server-only";

import { resolveAuthenticatedStaffProfile } from "@/features/shared/lib/server/admin-access";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import {
  getActorCapabilities,
  ROLE_GROUPS,
  type CanonicalRole,
} from "@/features/shared/lib/rbac";

type SessionClient = ReturnType<typeof createServerSupabaseRoute>;

const BILLING_ROLES = new Set<CanonicalRole>(ROLE_GROUPS.billingOperators);

export async function canAccessInvoicePdf(input: {
  supabase: SessionClient;
  authUserId: string;
  shopId: string;
  customerId: string | null;
}): Promise<boolean> {
  const { profile } = await resolveAuthenticatedStaffProfile(
    input.supabase,
    input.authUserId,
  );

  if (profile?.shop_id === input.shopId) {
    const actor = getActorCapabilities({ role: profile.role });
    if (actor.isKnownRole && BILLING_ROLES.has(actor.canonicalRole)) {
      return true;
    }
  }

  if (!input.customerId) return false;

  const { data: portalAccess, error: portalAccessError } = await input.supabase.rpc(
    "profixiq_is_portal_customer_for",
    {
      p_customer_id: input.customerId,
      p_shop_id: input.shopId,
    },
  );

  return !portalAccessError && portalAccess === true;
}
