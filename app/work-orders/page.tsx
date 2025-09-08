export const dynamic = "force-dynamic";
export const revalidate = 0;

import RoleHubTiles from "@/features/shared/components/RoleHubTiles/RoleHubTiles";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import type { Database } from "@shared/types/types/supabase";

async function getRoles(): Promise<("owner"|"admin"|"manager"|"advisor"|"mechanic"|"parts")[]> {
  const supabase = createServerComponentClient<Database>({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return profile?.role ? [profile.role as any] : [];
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
