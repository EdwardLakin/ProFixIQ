import "server-only";

import { resolveAuthenticatedStaffProfile } from "@/features/shared/lib/server/admin-access";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { resolveWorkOrderFinancialAccess } from "@/features/work-orders/workspace/server/workOrderFinancialAuthorization";
import {
  resolveShopProductAccess,
  SHOP_PRODUCT_CAPABILITIES,
} from "@/features/shared/lib/product-access";

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
    const productAccess = await resolveShopProductAccess({
      supabase: input.supabase,
      shopId: input.shopId,
      capabilities: SHOP_PRODUCT_CAPABILITIES,
    });
    if (productAccess.error || !productAccess.entitled) return false;

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
