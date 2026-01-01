// app/portal/fleet/layout.tsx
import { redirect } from "next/navigation";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type ProfileRow = DB["public"]["Tables"]["profiles"]["Row"];

const FLEET_ROLES: ProfileRow["role"][] = [
  "driver",
  "dispatcher",
  "fleet_manager",
  // add "owner" / "admin" here if shop staff should also see fleet portal
];

export default async function FleetPortalLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = createServerComponentClient<DB>({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/portal/auth/sign-in?portal=fleet");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile || !FLEET_ROLES.includes(profile.role)) {
    // No fleet access → send them to normal customer portal or back to sign-in
    redirect("/portal");
  }

  return <>{children}</>;
}