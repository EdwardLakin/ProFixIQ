import { redirect } from "next/navigation";
import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";
import type { ReactNode } from "react";
import { resolveFleetActorContext } from "@/features/fleet/lib/resolveFleetActorContext";

export default async function FleetLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = createServerSupabaseRSC();
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
