import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

import type { Database } from "@shared/types/types/supabase";

export type DashboardIdentity = {
  userId: string | null;
  shopId: string | null;
  role: string | null;
  fullName: string | null;
};

export async function getDashboardIdentity(): Promise<DashboardIdentity> {
  const supabase = createServerComponentClient<Database>({ cookies });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const userId = session?.user?.id ?? null;
  if (!userId) {
    return { userId: null, shopId: null, role: null, fullName: null };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, shop_id")
    .eq("id", userId)
    .maybeSingle();

  return {
    userId,
    shopId: profile?.shop_id ?? null,
    role: profile?.role ?? null,
    fullName: profile?.full_name ?? null,
  };
}

export function createDashboardServerClient() {
  return createServerComponentClient<Database>({ cookies });
}
