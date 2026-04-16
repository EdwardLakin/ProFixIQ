import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { resolvePortalMode } from "@/features/portal/lib/resolvePortalMode";

type DB = Database;

export async function requireFleetPortalActor() {
  const supabase = createServerComponentClient<DB>({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/portal/auth/sign-in?redirect=%2Fportal%2Ffleet");
  }

  const mode = await resolvePortalMode(supabase, user.id);
  if (mode !== "fleet") {
    redirect("/portal");
  }
}
