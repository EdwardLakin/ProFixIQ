// app/dashboard/page.tsx
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

export default async function DashboardIndex() {
  const supabase = createServerComponentClient<Database>({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const role = profile?.role ?? null;
  const dest =
    role === "owner"   ? "/dashboard/owner"   :
    role === "admin"   ? "/dashboard/admin"   :
    role === "manager" ? "/dashboard/manager" :
    role === "advisor" ? "/dashboard/advisor" :
    role === "parts"   ? "/dashboard/parts"   :
    role === "mechanic" || role === "tech" ? "/dashboard/tech" :
    "/onboarding";

  redirect(dest);
}