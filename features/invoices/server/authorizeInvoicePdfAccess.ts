import "server-only";

import { resolveAuthenticatedStaffProfile } from "@/features/shared/lib/server/admin-access";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { resolveWorkOrderFinancialAccess } from "@/features/work-orders/workspace/server/workOrderFinancialAuthorization";

type SessionClient = ReturnType<typeof createServerSupabaseRoute>;

export async function canAccessInvoicePdf(input: {
  supabase: SessionClient;
  authUserId: string;
  shopId: string;
  customerId: string | null;
  customerVisibleDocument: boolean;
}): Promise<boolean> {
  const { profile } = await resolveAuthenticatedStaffProfile(
    input.supabase,
    input.authUserId,
  );

  if (profile?.shop_id === input.shopId) {
    const financial = await resolveWorkOrderFinancialAccess({
      supabase: input.supabase,
      profileId: profile.id,
      shopId: input.shopId,
    });
    if (financial.error === null && financial.access.canViewInvoice) {
      return true;
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
