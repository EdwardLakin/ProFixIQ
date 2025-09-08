// app/work-orders/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import RoleHubTiles from "@shared/components/RoleHubTiles/RoleHubTiles";
import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import type { Role } from "@shared/components/RoleHubTiles/tiles";

type DB = Database;

async function getRoles(): Promise<Role[]> {
  const supabase = createServerComponentClient<DB>({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const allowed: Role[] = ["owner", "admin", "manager", "advisor", "mechanic", "parts"];
  return profile?.role && (allowed as string[]).includes(profile.role)
    ? [profile.role as Role]
    : [];
}

export default async function WorkOrdersHome() {
  const roles = await getRoles();
  return (
    <RoleHubTiles
      roles={roles}
      scope="work_orders"
      heading="Work Orders"
      description="Choose an action below."
    />
  );
}