import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";
import FleetServiceRequestsPage from "@/features/fleet/components/FleetServiceRequestsPage";
import { resolveFleetUiContext } from "@/features/fleet/lib/fleetUiCapabilities";


export default async function PortalFleetServiceRequestsPage() {
  const supabase = createServerSupabaseRSC();
  const uiContext = await resolveFleetUiContext(supabase);

  return <FleetServiceRequestsPage uiContext={uiContext} />;
}
