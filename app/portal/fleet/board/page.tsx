import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";
import FleetDispatchBoard from "@/features/fleet/components/FleetDispatchBoard";
import { resolveFleetUiContext } from "@/features/fleet/lib/fleetUiCapabilities";


export default async function PortalFleetBoardPage() {
  const supabase = createServerSupabaseRSC();
  const uiContext = await resolveFleetUiContext(supabase);

  return <FleetDispatchBoard uiContext={uiContext} routePrefix="/portal/fleet" />;
}
