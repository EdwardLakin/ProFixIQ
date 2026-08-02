import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";
import FleetUnitsPage from "@/features/fleet/components/FleetUnitsPage";
import { resolveFleetActorContext } from "@/features/fleet/lib/resolveFleetActorContext";
import { getFleetUiContext } from "@/features/fleet/lib/fleetUiCapabilities";

export default async function PortalFleetUnitsPage() {
  const supabase = createServerSupabaseRSC();
  const actor = await resolveFleetActorContext(supabase);

  return (
    <FleetUnitsPage
      shopId={actor.shopId}
      uiContext={getFleetUiContext(actor)}
      routePrefix="/portal/fleet"
    />
  );
}
