import FleetControlTower from "@/features/fleet/components/FleetControlTower";
import FleetDefectQueue from "@/features/fleet/components/FleetDefectQueue";
import FleetDispatcherDashboard from "@/features/fleet/components/FleetDispatcherDashboard";
import FleetDriverDashboard from "@/features/fleet/components/FleetDriverDashboard";
import { getFleetUiContext } from "@/features/fleet/lib/fleetUiCapabilities";
import { resolveFleetActorContext } from "@/features/fleet/lib/resolveFleetActorContext";
import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";
import { getFleetPortalActorContext } from "./_lib/requireFleetPortalActor";

type PortalFleetPageProps = {
  searchParams: Promise<{ fleetId?: string; focus?: string }>;
};

export default async function PortalFleetPage({
  searchParams,
}: PortalFleetPageProps) {
  const initialActor = await getFleetPortalActorContext();
  const { fleetId: requestedFleetId, focus } = await searchParams;

  let actor = initialActor;
  if (
    requestedFleetId &&
    requestedFleetId !== initialActor.primaryFleetId &&
    initialActor.fleetIds.includes(requestedFleetId)
  ) {
    actor = await resolveFleetActorContext(createServerSupabaseRSC(), {
      userId: initialActor.userId,
      requestedFleetId,
    });
  }

  const uiContext = getFleetUiContext(actor);
  const selectedFleetId = actor.primaryFleetId;

  if (actor.actorType === "fleet_driver") {
    return <FleetDriverDashboard />;
  }

  if (focus === "defects" && actor.capabilities.canSeeFleetWideUnits) {
    return (
      <main className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-6 sm:py-6">
        <FleetDefectQueue
          fleetId={selectedFleetId}
          mode={actor.actorType === "fleet_dispatcher" ? "dispatcher" : "manager"}
        />
      </main>
    );
  }

  if (actor.actorType === "fleet_dispatcher") {
    return (
      <FleetDispatcherDashboard
        fleetId={selectedFleetId}
        actorLabel={uiContext.actorLabel}
      />
    );
  }

  return (
    <FleetControlTower
      shopName="ProFixIQ Fleet"
      shopId={actor.shopId}
      fleetId={selectedFleetId}
      uiContext={uiContext}
      routePrefix="/portal/fleet"
    />
  );
}
