import { redirect } from "next/navigation";

import FleetMaintenanceWorkspace from "@/features/fleet/components/FleetMaintenanceWorkspace";
import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";
import { resolveFleetUiContext } from "@/features/fleet/lib/fleetUiCapabilities";

export default async function PortalFleetMaintenancePage() {
  const supabase = createServerSupabaseRSC();
  const uiContext = await resolveFleetUiContext(supabase);
  if (uiContext.experience === "external_driver") redirect("/portal/fleet");

  return (
    <FleetMaintenanceWorkspace
      uiContext={uiContext}
      routePrefix="/portal/fleet"
    />
  );
}
