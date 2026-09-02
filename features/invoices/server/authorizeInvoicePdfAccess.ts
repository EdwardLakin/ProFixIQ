import "server-only";

import {
  resolveWorkOrderProductAuthority,
  type ShopAccess,
} from "@/features/mobile/service/server/access";
import { resolveAuthenticatedStaffProfile } from "@/features/shared/lib/server/admin-access";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { getActorCapabilities } from "@/features/shared/lib/rbac";
import { resolveWorkOrderFinancialAccess } from "@/features/work-orders/workspace/server/workOrderFinancialAuthorization";

type SessionClient = ReturnType<typeof createServerSupabaseRoute>;

export async function canAccessInvoicePdf(input: {
  supabase: SessionClient;
  authUserId: string;
  shopId: string;
  workOrderId: string;
  customerId: string | null;
  customerVisibleDocument: boolean;
}): Promise<boolean> {
  const { profile } = await resolveAuthenticatedStaffProfile(
    input.supabase,
    input.authUserId,
  );

  if (profile?.shop_id === input.shopId) {
    try {
      const actor = getActorCapabilities({ role: profile.role });
      const staffAccess: ShopAccess = {
        ok: true,
        profile: { ...profile, shop_id: input.shopId },
        canonicalRole: actor.canonicalRole,
        authUserId: input.authUserId,
        supabase: input.supabase,
      };
      const productAuthority = await resolveWorkOrderProductAuthority(
        staffAccess,
        input.workOrderId,
      );
      if (productAuthority.authorized) {
        const financial = await resolveWorkOrderFinancialAccess({
          supabase: input.supabase,
          profileId: profile.id,
          shopId: input.shopId,
        });
        if (financial.error === null && financial.access.canViewInvoice) {
          return true;
        }
      }
    } catch {
      // A failed staff/product lookup must not suppress the independent portal relationship check.
    }
  }

  // Portal customers remain on their separate durable membership and
  // immutable-document lifecycle path. Staff capability policy must never be
  // used as a substitute for customer ownership.
  if (!input.customerVisibleDocument || !input.customerId) return false;

  const { data: portalAccess, error: portalAccessError } =
    await input.supabase.rpc("profixiq_is_portal_customer_for", {
      p_customer_id: input.customerId,
      p_shop_id: input.shopId,
    });

  return !portalAccessError && portalAccess === true;
}
