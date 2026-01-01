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
  "owner",
  "admin",
  "manager",
  // include this if you want advisors to see the fleet portal too:
  // "advisor",
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
    // not signed in at all → fleet sign-in
    redirect("/portal/auth/sign-in?portal=fleet");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile) {
    // no matching profile → kick to generic portal sign-in
    redirect("/portal/auth/sign-in?portal=fleet");
  }

  if (!FLEET_ROLES.includes(profile.role)) {
    // logged in but not a fleet-capable role → send to normal customer portal home
    redirect("/portal");
  }

  // ✅ user is allowed into fleet portal
  return <>{children}</>;
}