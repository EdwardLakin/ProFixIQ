import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

import {
  resolveWorkOrderProductAuthority,
  type ShopAccess,
} from "@/features/mobile/service/server/access";
import { resolveCanonicalStaffProfile } from "@/features/shared/lib/authenticated-profile";
import {
  resolveShopProductAccess,
  SHOP_PRODUCT_CAPABILITIES,
} from "@/features/shared/lib/product-access";
import { getActorCapabilities } from "@/features/shared/lib/rbac";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

type DB = Database;

/**
 * Inspection execution is shared by Shop and Field, but Field remains bound to
 * a linked mobile visit. Legacy standalone inspections remain a Shop feature.
 */
export async function canExecuteInspectionForProduct(args: {
  supabase: SupabaseClient<DB>;
  shopId: string;
  workOrderId: string | null;
}): Promise<boolean> {
  const {
    data: { user },
    error: userError,
  } = await args.supabase.auth.getUser();
  if (userError || !user) return false;

  const { profile, error: profileError } = await resolveCanonicalStaffProfile(
    args.supabase,
    user.id,
    {
      linkedProfileClient: createAdminSupabase,
    },
  );
  const actor = getActorCapabilities({ role: profile?.role });
  if (
    profileError ||
    !profile ||
    profile.shop_id !== args.shopId ||
    !actor.isKnownRole ||
    actor.canonicalRole === "customer" ||
    !actor.canRunInspections
  ) {
    return false;
  }

  if (!args.workOrderId) {
    const shopProduct = await resolveShopProductAccess({
      supabase: args.supabase,
      shopId: args.shopId,
      capabilities: SHOP_PRODUCT_CAPABILITIES,
    });
    return !shopProduct.error && shopProduct.entitled;
  }

  const access: ShopAccess = {
    ok: true,
    profile: { ...profile, shop_id: args.shopId },
    canonicalRole: actor.canonicalRole,
    authUserId: user.id,
    supabase: args.supabase,
  };
  try {
    return (await resolveWorkOrderProductAuthority(access, args.workOrderId))
      .authorized;
  } catch {
    return false;
  }
}
