import { redirect } from "next/navigation";

import FleetDriversWorkspace from "@/features/fleet/components/FleetDriversWorkspace";
import FleetPortalAccessManager from "@/features/fleet/components/FleetPortalAccessManager";
import { resolveFleetActorContext } from "@/features/fleet/lib/resolveFleetActorContext";
import { getFleetUiContext } from "@/features/fleet/lib/fleetUiCapabilities";
import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";

export default async function FleetDriversPage() {
  const supabase = createServerSupabaseRSC();
  const actor = await resolveFleetActorContext(supabase);
  const uiContext = getFleetUiContext(actor);
  if (uiContext.experience === "external_driver") redirect("/portal/fleet");

  const canInviteDrivers =
    actor.isInternal &&
    ["owner", "admin", "manager"].includes(actor.canonicalRole);

  return (
    <div className="space-y-6">
      <FleetDriversWorkspace
        actorLabel={uiContext.actorLabel}
        canInviteDrivers={canInviteDrivers}
      />
      {canInviteDrivers ? (
        <section id="driver-access" className="scroll-mt-24">
          <FleetPortalAccessManager
            embedded
            routePrefix="/portal/fleet"
            defaultRole="viewer"
          />
        </section>
      ) : (
        <section className="rounded-2xl border border-sky-300/20 bg-sky-300/[0.08] p-4 text-sm text-[color:var(--theme-text-secondary)]">
          Driver invitations are issued by the connected Shop administrator.
          Fleet managers can assign accepted drivers and manage their Fleet-only
          role from Fleet Settings.
        </section>
      )}
    </div>
  );
}
