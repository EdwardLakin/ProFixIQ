import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";
import PretripReportsPage from "@/features/fleet/components/PretripReportsPage";
import { resolveFleetUiContext } from "@/features/fleet/lib/fleetUiCapabilities";


export default async function PortalFleetPretripHistoryPage() {
  const supabase = createServerSupabaseRSC();
  const uiContext = await resolveFleetUiContext(supabase);

  return <PretripReportsPage uiContext={uiContext} routePrefix="/portal/fleet" />;
}
