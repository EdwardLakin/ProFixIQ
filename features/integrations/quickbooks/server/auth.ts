import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { DB, ProfileRow, ShopRow } from "../types";
import { hasAnyRole, ROLE_GROUPS } from "@/features/shared/lib/rbac";

export type QuickBooksAuthContext = {
  user: User;
  profile: Pick<ProfileRow, "id" | "role" | "shop_id">;
  shop: Pick<
    ShopRow,
    "id" | "name" | "shop_name" | "business_name" | "country" | "timezone"
  >;
};

export async function requireQuickBooksShopAccess(
  supabase: SupabaseClient<DB>,
): Promise<
  | { ok: true; data: QuickBooksAuthContext }
  | { ok: false; status: number; error: string }
> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role, shop_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return { ok: false, status: 500, error: profileError.message };
  }

  if (!profile?.shop_id) {
    return { ok: false, status: 400, error: "No shop found for this account." };
  }

  if (!hasAnyRole(profile.role, ROLE_GROUPS.accountAdministrators)) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  const { data: shop, error: shopError } = await supabase
    .from("shops")
    .select("id, name, shop_name, business_name, country, timezone")
    .eq("id", profile.shop_id)
    .maybeSingle();

  if (shopError) {
    return { ok: false, status: 500, error: shopError.message };
  }

  if (!shop) {
    return { ok: false, status: 404, error: "Shop not found." };
  }

  return {
    ok: true,
    data: {
      user,
      profile: {
        id: profile.id,
        role: profile.role,
        shop_id: profile.shop_id,
      },
      shop,
    },
  };
}
