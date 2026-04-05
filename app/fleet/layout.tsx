import { redirect } from "next/navigation";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import type { Database } from "@shared/types/types/supabase";
import { resolveCurrentActor } from "@/features/shared/lib/currentActor";

type DB = Database;
type ProfileRow = DB["public"]["Tables"]["profiles"]["Row"];

const FLEET_ROLES: ProfileRow["role"][] = [
  "driver",
  "dispatcher",
  "fleet_manager",
  "owner",
  "admin",
  "manager",
];

export default async function FleetLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = createServerComponentClient<DB>({ cookies });
  const actor = await resolveCurrentActor(supabase);

  if (!actor.user) {
    redirect("/sign-in?next=%2Ffleet");
  }

  if (!actor.profile || !actor.role || !FLEET_ROLES.includes(actor.role)) {
    redirect("/dashboard");
  }

  return <>{children}</>;
}
