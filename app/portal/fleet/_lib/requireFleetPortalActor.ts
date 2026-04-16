import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { resolveFleetActorContext } from "@/features/fleet/lib/resolveFleetActorContext";

type DB = Database;

export async function requireFleetPortalActor() {
  const supabase = createServerComponentClient<DB>({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/portal/auth/sign-in?redirect=%2Fportal%2Ffleet");
  }

  const actor = await resolveFleetActorContext(supabase, { userId: user.id });
  if (!actor.capabilities.canAccessPortalFleetWrappers) {
    redirect("/portal");
  }
}
