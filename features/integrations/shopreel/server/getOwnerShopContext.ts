import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

export async function getOwnerShopContext() {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: "Unauthorized", status: 401 as const };
  }

  const { data: membership, error: membershipError } = await supabase
    .from("shop_members")
    .select("shop_id, role")
    .eq("user_id", user.id)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    return { error: membershipError.message, status: 500 as const };
  }

  if (!membership?.shop_id) {
    return { error: "Owner shop membership not found.", status: 403 as const };
  }

  return {
    supabase,
    user,
    shopId: membership.shop_id as string,
  };
}
