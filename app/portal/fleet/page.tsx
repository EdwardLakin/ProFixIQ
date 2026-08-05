import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";
import FleetControlTower from "@/features/fleet/components/FleetControlTower";
import { resolveFleetActorContext } from "@/features/fleet/lib/resolveFleetActorContext";
import { getFleetUiContext } from "@/features/fleet/lib/fleetUiCapabilities";


export default async function PortalFleetPage() {
  const supabase = createServerSupabaseRSC();
  const actor = await resolveFleetActorContext(supabase);
  const uiContext = getFleetUiContext(actor);

  return (
    <FleetControlTower
      shopName="ProFixIQ Fleet"
      shopId={actor.shopId}
      fleetId={actor.primaryFleetId}
      uiContext={uiContext}
      routePrefix="/portal/fleet"
    />
  );
}
