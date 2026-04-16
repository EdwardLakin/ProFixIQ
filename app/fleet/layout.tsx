import { redirect } from "next/navigation";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import type { Database } from "@shared/types/types/supabase";
import { resolveFleetActorContext } from "@/features/fleet/lib/resolveFleetActorContext";

type DB = Database;
export default async function FleetLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = createServerComponentClient<DB>({ cookies });
  const actor = await resolveFleetActorContext(supabase);

  if (!actor.userId) {
    redirect("/sign-in?next=%2Ffleet");
  }

  if (
    actor.actorType === "none" ||
    (!actor.isInternal && !actor.capabilities.canAccessPortalFleetWrappers)
  ) {
    redirect("/dashboard");
  }

  return <>{children}</>;
}
