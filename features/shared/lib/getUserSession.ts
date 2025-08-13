"use server";

import { createServerClient} from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import type { Database } from "@shared/types/types/supabase";
import { redirect } from "next/navigation";

export async function getUserSession() {
  const supabase = createServerComponentClient<Database>({
    cookies: () => cookies(), // ✅ correct usage
  });

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    redirect("/sign-in");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("plan, shop(id, name, city, province, owner_id, plan, user_limit)")
    .eq("id", session.user.id)
    .single();

  if (error || !profile) {
    console.error("❌ Failed to load profile:", error);
    redirect("/sign-in");
  }

  return {
    session,
    user: session.user,
    plan: profile.plan,
    shop: profile.shop,
  };
}
